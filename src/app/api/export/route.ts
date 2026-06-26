import { prisma } from "@/lib/db";

export async function GET() {
  const [trips, gasEntries] = await Promise.all([
    prisma.trip.findMany({ orderBy: { date: "desc" } }),
    prisma.gasEntry.findMany({ orderBy: { date: "desc" } }),
  ]);

  let csv = "Type,Date,Details,Distance (mi),Gallons,Cost ($),Paid By,Category,Station,Odometer,Fuel Type\n";

  for (const trip of trips) {
    csv += `Trip,${new Date(trip.date).toLocaleDateString()},"${trip.startAddress} → ${trip.endAddress}",${trip.distance},,,,${trip.category},,\n`;
  }
  for (const entry of gasEntries) {
    csv += `Gas,${new Date(entry.date).toLocaleDateString()},,${entry.gallons},${entry.totalCost.toFixed(2)},${entry.paidBy},,${entry.stationName || ""},${entry.odometer || ""},${entry.fuelType}\n`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="drive-tracker-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
