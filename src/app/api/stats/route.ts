import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const requestedPeriod = new URL(request.url).searchParams.get("period");
  const period = requestedPeriod === "90d" || requestedPeriod === "12m" ? requestedPeriod : "30d";
  const periodMs = period === "90d" ? 90 * 24 * 60 * 60 * 1000
    : period === "12m" ? 365 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  const currentStart = new Date(now.getTime() - periodMs);
  const previousStart = new Date(currentStart.getTime() - periodMs);

  // Compute everything in the database with aggregates instead of pulling every row
  // (which also dragged the large `routeEncoded` column over the wire) into JS.
  const [
    tripTotals,
    tripWeek,
    favoriteCount,
    categoryGroups,
    gasTotals,
    paidByGroups,
    gasMonth,
    settings,
    currentTrips,
    currentGas,
    previousTrips,
    previousGas,
  ] = await Promise.all([
    prisma.trip.aggregate({ _count: { _all: true }, _sum: { distance: true } }),
    prisma.trip.aggregate({
      where: { date: { gte: weekAgo } },
      _count: { _all: true },
      _sum: { distance: true },
    }),
    prisma.trip.count({ where: { isFavorite: true } }),
    prisma.trip.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.gasEntry.aggregate({
      _sum: { gallons: true, totalCost: true },
      _avg: { pricePerGallon: true },
    }),
    prisma.gasEntry.groupBy({ by: ["paidBy"], _sum: { totalCost: true } }),
    prisma.gasEntry.aggregate({
      where: { date: { gte: monthStart, lt: nextMonthStart } },
      _sum: { totalCost: true },
    }),
    prisma.settings.findFirst({ select: { monthlyBudget: true, distanceUnit: true } }),
    prisma.trip.aggregate({
      where: { date: { gte: currentStart, lte: now } },
      _count: { _all: true },
      _sum: { distance: true },
    }),
    prisma.gasEntry.aggregate({
      where: { date: { gte: currentStart, lte: now } },
      _sum: { totalCost: true },
    }),
    prisma.trip.aggregate({
      where: { date: { gte: previousStart, lt: currentStart } },
      _count: { _all: true },
      _sum: { distance: true },
    }),
    prisma.gasEntry.aggregate({
      where: { date: { gte: previousStart, lt: currentStart } },
      _sum: { totalCost: true },
    }),
  ]);

  const totalMiles = tripTotals._sum.distance ?? 0;
  const totalGallons = gasTotals._sum.gallons ?? 0;
  const totalSpent = gasTotals._sum.totalCost ?? 0;
  const selfPaid =
    paidByGroups.find((g) => g.paidBy === "SELF")?._sum.totalCost ?? 0;
  const parentsPaid =
    paidByGroups.find((g) => g.paidBy === "PARENTS")?._sum.totalCost ?? 0;

  const categoryCounts: Record<string, number> = {};
  for (const g of categoryGroups) categoryCounts[g.category] = g._count._all;

  const periodStats = {
    period,
    trips: currentTrips._count._all,
    miles: Math.round((currentTrips._sum.distance ?? 0) * 10) / 10,
    spent: Math.round((currentGas._sum.totalCost ?? 0) * 100) / 100,
    previousTrips: previousTrips._count._all,
    previousMiles: Math.round((previousTrips._sum.distance ?? 0) * 10) / 10,
    previousSpent: Math.round((previousGas._sum.totalCost ?? 0) * 100) / 100,
  };

  return Response.json({
    totalTrips: tripTotals._count._all,
    totalMiles: Math.round(totalMiles * 10) / 10,
    totalGallons: Math.round(totalGallons * 10) / 10,
    totalSpent: Math.round(totalSpent * 100) / 100,
    selfPaid: Math.round(selfPaid * 100) / 100,
    parentsPaid: Math.round(parentsPaid * 100) / 100,
    avgMpg: totalGallons > 0 ? Math.round((totalMiles / totalGallons) * 10) / 10 : 0,
    costPerMile: totalMiles > 0 ? Math.round((totalSpent / totalMiles) * 100) / 100 : 0,
    avgPricePerGallon: Math.round((gasTotals._avg.pricePerGallon ?? 0) * 100) / 100,
    monthlySpent: Math.round((gasMonth._sum.totalCost ?? 0) * 100) / 100,
    weeklyMiles: Math.round((tripWeek._sum.distance ?? 0) * 10) / 10,
    weeklyTrips: tripWeek._count._all,
    categoryCounts,
    monthlyBudget: settings?.monthlyBudget ?? 0,
    distanceUnit: settings?.distanceUnit ?? "miles",
    periodStats,
    favoriteCount,
  });
}
