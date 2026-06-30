import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const paidBy = searchParams.get("paidBy");
  const fuelType = searchParams.get("fuelType");
  const sort = searchParams.get("sort") || "date";
  const order = searchParams.get("order") || "desc";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (paidBy) where.paidBy = paidBy;
  if (fuelType) where.fuelType = fuelType;
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }

  const orderBy: Record<string, string> = {};
  if (sort === "cost") orderBy.totalCost = order;
  else if (sort === "gallons") orderBy.gallons = order;
  else orderBy.date = order;

  const gasEntries = await prisma.gasEntry.findMany({
    where,
    // The gas page only shows the linked trip's endpoints — avoid pulling the
    // whole Trip row (including its large routeEncoded column) per entry.
    include: { trip: { select: { startAddress: true, endAddress: true } } },
    orderBy,
  });
  return Response.json(gasEntries);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const entry = await prisma.gasEntry.create({
    data: {
      date: new Date(body.date),
      gallons: body.gallons,
      pricePerGallon: body.pricePerGallon,
      totalCost: body.gallons * body.pricePerGallon,
      paidBy: body.paidBy,
      fuelType: body.fuelType || "REGULAR",
      stationName: body.stationName || null,
      odometer: body.odometer || null,
      vehicleName: body.vehicleName || null,
      tripId: body.tripId || null,
    },
  });
  return Response.json(entry, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.gasEntry.delete({ where: { id } });
  return Response.json({ success: true });
}
