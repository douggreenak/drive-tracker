import { prisma } from "@/lib/db";

export async function GET() {
  const [trips, gasEntries, settings] = await Promise.all([
    prisma.trip.findMany(),
    prisma.gasEntry.findMany(),
    prisma.settings.findFirst(),
  ]);

  const totalTrips = trips.length;
  const totalMiles = trips.reduce((sum, t) => sum + t.distance, 0);
  const totalGallons = gasEntries.reduce((sum, g) => sum + g.gallons, 0);
  const totalSpent = gasEntries.reduce((sum, g) => sum + g.totalCost, 0);
  const selfPaid = gasEntries
    .filter((g) => g.paidBy === "SELF")
    .reduce((sum, g) => sum + g.totalCost, 0);
  const parentsPaid = gasEntries
    .filter((g) => g.paidBy === "PARENTS")
    .reduce((sum, g) => sum + g.totalCost, 0);
  const avgMpg = totalGallons > 0 ? totalMiles / totalGallons : 0;
  const costPerMile = totalMiles > 0 ? totalSpent / totalMiles : 0;

  const avgPricePerGallon =
    gasEntries.length > 0
      ? gasEntries.reduce((s, g) => s + g.pricePerGallon, 0) / gasEntries.length
      : 0;

  const now = new Date();
  const thisMonth = gasEntries.filter((g) => {
    const d = new Date(g.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlySpent = thisMonth.reduce((s, g) => s + g.totalCost, 0);

  const thisWeekTrips = trips.filter((t) => {
    const d = new Date(t.date);
    const diff = now.getTime() - d.getTime();
    return diff < 7 * 24 * 60 * 60 * 1000;
  });
  const weeklyMiles = thisWeekTrips.reduce((s, t) => s + t.distance, 0);

  const categoryCounts: Record<string, number> = {};
  trips.forEach((t) => {
    categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
  });

  const monthlyBudget = settings?.monthlyBudget || 0;

  return Response.json({
    totalTrips,
    totalMiles: Math.round(totalMiles * 10) / 10,
    totalGallons: Math.round(totalGallons * 10) / 10,
    totalSpent: Math.round(totalSpent * 100) / 100,
    selfPaid: Math.round(selfPaid * 100) / 100,
    parentsPaid: Math.round(parentsPaid * 100) / 100,
    avgMpg: Math.round(avgMpg * 10) / 10,
    costPerMile: Math.round(costPerMile * 100) / 100,
    avgPricePerGallon: Math.round(avgPricePerGallon * 100) / 100,
    monthlySpent: Math.round(monthlySpent * 100) / 100,
    weeklyMiles: Math.round(weeklyMiles * 10) / 10,
    weeklyTrips: thisWeekTrips.length,
    categoryCounts,
    monthlyBudget,
    favoriteCount: trips.filter((t) => t.isFavorite).length,
  });
}
