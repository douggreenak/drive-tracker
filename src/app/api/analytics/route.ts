import { prisma } from "@/lib/db";

// Aggregated analytics for the Insights page: 12-month trends plus breakdowns by vehicle, fuel
// type, and trip category. Personal-scale data, so we pull the (small, projected) rows and bucket
// in JS rather than issuing a dozen grouped queries.
export async function GET() {
  const [trips, gas] = await Promise.all([
    prisma.trip.findMany({ select: { date: true, distance: true, category: true } }),
    prisma.gasEntry.findMany({
      select: { date: true, gallons: true, totalCost: true, paidBy: true, vehicleName: true, fuelType: true },
    }),
  ]);

  // Build the last 12 month buckets (oldest → newest), keyed YYYY-MM.
  const now = new Date();
  const months: { key: string; label: string; spent: number; miles: number; gallons: number; trips: number; selfPaid: number; parentsPaid: number }[] = [];
  const index = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    index.set(key, months.length);
    months.push({
      key,
      label: d.toLocaleString("en-US", { month: "short" }),
      spent: 0, miles: 0, gallons: 0, trips: 0, selfPaid: 0, parentsPaid: 0,
    });
  }
  const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  for (const t of trips) {
    const m = index.get(monthKey(new Date(t.date)));
    if (m === undefined) continue;
    months[m].miles += t.distance;
    months[m].trips += 1;
  }

  const byVehicle = new Map<string, { spent: number; gallons: number }>();
  const byFuel = new Map<string, { spent: number; gallons: number }>();
  for (const g of gas) {
    const m = index.get(monthKey(new Date(g.date)));
    if (m !== undefined) {
      months[m].spent += g.totalCost;
      months[m].gallons += g.gallons;
      if (g.paidBy === "PARENTS") months[m].parentsPaid += g.totalCost;
      else months[m].selfPaid += g.totalCost;
    }
    const vName = g.vehicleName || "Unspecified";
    const v = byVehicle.get(vName) ?? { spent: 0, gallons: 0 };
    v.spent += g.totalCost; v.gallons += g.gallons; byVehicle.set(vName, v);
    const f = byFuel.get(g.fuelType) ?? { spent: 0, gallons: 0 };
    f.spent += g.totalCost; f.gallons += g.gallons; byFuel.set(g.fuelType, f);
  }

  const byCategory = new Map<string, { trips: number; miles: number }>();
  for (const t of trips) {
    const c = byCategory.get(t.category) ?? { trips: 0, miles: 0 };
    c.trips += 1; c.miles += t.distance; byCategory.set(t.category, c);
  }

  const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

  return Response.json({
    monthly: months.map((m) => ({
      label: m.label,
      key: m.key,
      spent: round(m.spent),
      miles: round(m.miles, 1),
      gallons: round(m.gallons, 1),
      trips: m.trips,
      selfPaid: round(m.selfPaid),
      parentsPaid: round(m.parentsPaid),
      mpg: m.gallons > 0 ? round(m.miles / m.gallons, 1) : 0,
    })),
    byVehicle: [...byVehicle.entries()]
      .map(([name, v]) => ({ name, spent: round(v.spent), gallons: round(v.gallons, 1) }))
      .sort((a, b) => b.spent - a.spent),
    byFuel: [...byFuel.entries()]
      .map(([type, v]) => ({ type, spent: round(v.spent), gallons: round(v.gallons, 1) }))
      .sort((a, b) => b.spent - a.spent),
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, trips: v.trips, miles: round(v.miles, 1) }))
      .sort((a, b) => b.miles - a.miles),
  });
}
