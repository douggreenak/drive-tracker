import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

// Single trip with its gas entries and route polyline — powers the web trip-detail page.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await prisma.trip.findUnique({
    where: { id },
    select: {
      id: true,
      date: true,
      startAddress: true,
      endAddress: true,
      startLat: true,
      startLng: true,
      endLat: true,
      endLng: true,
      distance: true,
      duration: true,
      notes: true,
      category: true,
      isFavorite: true,
      paidBy: true,
      routeEncoded: true,
      gasEntries: {
        select: { id: true, date: true, gallons: true, pricePerGallon: true, totalCost: true, paidBy: true, fuelType: true, stationName: true },
      },
    },
  });
  if (!trip) return Response.json({ error: "Trip not found" }, { status: 404 });
  return Response.json(trip);
}
