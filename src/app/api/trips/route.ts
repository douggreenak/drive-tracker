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
  // Full fidelity — every field a full cloud restore needs, still without track points (those are
  // fetched per-trip from `/api/trips/[id]/points`, see that route's doc comment).
  const full = searchParams.get("full") === "true";

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
  // `routeEncoded`/`matchedPolyline` columns and the createdAt/updatedAt timestamps — unless a
  // full restore asked for everything.
  const trips = await prisma.trip.findMany({
    where,
    orderBy,
    select: full
      ? undefined
      : {
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
          stops: true,
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
      endDate: body.endDate ? new Date(body.endDate) : null,
      startAddress: body.startAddress,
      endAddress: body.endAddress,
      startLat: body.startLat,
      startLng: body.startLng,
      endLat: body.endLat,
      endLng: body.endLng,
      distance: body.distance,
      duration: body.duration,
      movingSeconds: body.movingSeconds != null ? Math.trunc(Number(body.movingSeconds)) : null,
      maxSpeed: body.maxSpeed != null ? Number(body.maxSpeed) : null,
      avgSpeed: body.avgSpeed != null ? Number(body.avgSpeed) : null,
      notes: body.notes || null,
      name: body.name || null,
      routeEncoded: body.routeEncoded || null,
      matchedPolyline: body.matchedPolyline || null,
      matchedFraction: body.matchedFraction != null ? Number(body.matchedFraction) : null,
      usedRouteMatching: body.usedRouteMatching === true,
      category: body.category || "OTHER",
      isFavorite: body.isFavorite || false,
      paidBy: body.paidBy ? String(body.paidBy) : "SELF",
      vehicleName: body.vehicleName || null,
      vehicleMpg: body.vehicleMpg != null ? Number(body.vehicleMpg) : null,
      estimatedGallons: body.estimatedGallons != null ? Number(body.estimatedGallons) : null,
      scheduledDeparture: body.scheduledDeparture ? new Date(body.scheduledDeparture) : null,
      scheduledArrival: body.scheduledArrival ? new Date(body.scheduledArrival) : null,
      journeyId: body.journeyId || null,
      legIndex: body.legIndex != null ? Math.trunc(Number(body.legIndex)) : 0,
      legTotal: body.legTotal != null ? Math.trunc(Number(body.legTotal)) : 1,
      isManualEntry: body.isManualEntry === true,
      stops: Array.isArray(body.stops) ? body.stops : undefined,
    },
  });
  return Response.json(trip, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  // Remove the trip and everything tied to it. Gas entries reference the trip, so they must go
  // first (the FK has no cascade) — do both in one transaction so a trip is never left with
  // orphaned fuel rows.
  await prisma.$transaction([
    prisma.gasEntry.deleteMany({ where: { tripId: id } }),
    prisma.trip.delete({ where: { id } }),
  ]);
  return Response.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id } = body;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  // Only allow a known set of editable fields — never spread arbitrary client
  // JSON into the update, which would let any column be overwritten.
  const data: Record<string, unknown> = {};
  if ("isFavorite" in body) data.isFavorite = body.isFavorite === true || body.isFavorite === "true";
  if ("category" in body) data.category = body.category;
  if ("notes" in body) data.notes = body.notes;
  if ("date" in body) data.date = new Date(body.date);
  if ("paidBy" in body) data.paidBy = body.paidBy ? String(body.paidBy) : "SELF";
  if ("stops" in body && Array.isArray(body.stops)) data.stops = body.stops;
  // Trimming a trip (cutting off a forgotten tail/start) rewrites the geometry + stats + endpoints.
  if ("distance" in body) data.distance = Number(body.distance) || 0;
  if ("duration" in body) data.duration = Math.trunc(Number(body.duration) || 0);
  if ("routeEncoded" in body) data.routeEncoded = body.routeEncoded == null ? null : String(body.routeEncoded);
  if ("startAddress" in body) data.startAddress = String(body.startAddress);
  if ("endAddress" in body) data.endAddress = String(body.endAddress);
  if ("startLat" in body) data.startLat = Number(body.startLat);
  if ("startLng" in body) data.startLng = Number(body.startLng);
  if ("endLat" in body) data.endLat = Number(body.endLat);
  if ("endLng" in body) data.endLng = Number(body.endLng);

  const trip = await prisma.trip.update({ where: { id }, data });
  return Response.json(trip);
}
