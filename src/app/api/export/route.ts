import { prisma } from "@/lib/db";

// Quote a field and escape embedded quotes so a comma or quote in a free-text value (address,
// station name, notes) can never shift the following columns.
function esc(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET() {
  // Select only the columns the CSV writes — avoids the large routeEncoded column.
  const [trips, gasEntries] = await Promise.all([
    prisma.trip.findMany({
      orderBy: { date: "desc" },
      select: {
        date: true,
        startAddress: true,
        endAddress: true,
        distance: true,
        paidBy: true,
        category: true,
      },
    }),
    prisma.gasEntry.findMany({
      orderBy: { date: "desc" },
      select: {
        date: true,
        gallons: true,
        totalCost: true,
        paidBy: true,
        stationName: true,
        odometer: true,
        fuelType: true,
      },
    }),
  ]);

  // Columns: Type, Date, Details, Distance, Gallons, Cost, Paid By, Category, Station, Odometer, Fuel Type
  let csv = "Type,Date,Details,Distance (mi),Gallons,Cost ($),Paid By,Category,Station,Odometer,Fuel Type\n";

  for (const trip of trips) {
    // Trip rows have no Gallons/Cost/Station/Odometer/Fuel Type.
    csv += `Trip,${new Date(trip.date).toLocaleDateString()},${esc(`${trip.startAddress} → ${trip.endAddress}`)},${trip.distance},,,${trip.paidBy},${trip.category},,,\n`;
  }
  for (const entry of gasEntries) {
    // Gas rows have no Details/Distance/Category — two empty cells after Date so Gallons lands right.
    csv += `Gas,${new Date(entry.date).toLocaleDateString()},,,${entry.gallons},${entry.totalCost.toFixed(2)},${entry.paidBy},,${esc(entry.stationName || "")},${entry.odometer || ""},${entry.fuelType}\n`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="drive-tracker-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
