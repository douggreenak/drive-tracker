import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search");
  const sort = searchParams.get("sort") || "date";
  const order = searchParams.get("order") || "desc";
  const category = searchParams.get("category");
  const favoritesOnly = searchParams.get("favorites") === "true";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { startAddress: { contains: search, mode: "insensitive" } },
      { endAddress: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ];
  }
  if (category) where.category = category;
  if (favoritesOnly) where.isFavorite = true;
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }

  const orderBy: Record<string, string> = {};
  if (sort === "distance") orderBy.distance = order;
  else if (sort === "duration") orderBy.duration = order;
  else orderBy.date = order;

  // Select only the columns the web pages render — notably excluding the large
  // `routeEncoded` polyline and the createdAt/updatedAt timestamps.
  const trips = await prisma.trip.findMany({
    where,
    orderBy,
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
      gasEntries: { select: { totalCost: true, paidBy: true } },
    },
  });
  return Response.json(trips);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const trip = await prisma.trip.create({
    data: {
      date: new Date(body.date),
      startAddress: body.startAddress,
      endAddress: body.endAddress,
      startLat: body.startLat,
      startLng: body.startLng,
      endLat: body.endLat,
      endLng: body.endLng,
      distance: body.distance,
      duration: body.duration,
      notes: body.notes || null,
      routeEncoded: body.routeEncoded || null,
      category: body.category || "OTHER",
      isFavorite: body.isFavorite || false,
    },
  });
  return Response.json(trip, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  await prisma.trip.delete({ where: { id } });
  return Response.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;
  if (data.date) data.date = new Date(data.date);
  const trip = await prisma.trip.update({ where: { id }, data });
  return Response.json(trip);
}
