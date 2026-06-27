import { prisma } from "@/lib/db";

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
