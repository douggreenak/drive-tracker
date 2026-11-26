import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import {
  TRIP_KNOWN_KEYS, parseIdBody, parseTripPatch, readBody, route,
} from "@/lib/api-input";
import { createTripRecord } from "@/lib/context";

const CATEGORY_VALUES = ["COMMUTE", "ERRAND", "ROAD_TRIP", "SCHOOL", "WORK", "LEISURE", "OTHER"];

export const GET = route(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search");
  const sort = searchParams.get("sort") || "date";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";
  const category = searchParams.get("category");
  const favoritesOnly = searchParams.get("favorites") === "true";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const requestedPage = searchParams.get("page");
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 25, 1), 100);
  const page = Math.max(Number(requestedPage) || 1, 1);
  const includeRoute = searchParams.get("includeRoute") === "true";
  // Full fidelity — every field a full cloud restore needs, still without track points (those are
  // fetched per-trip from `/api/trips/[id]/points`, see that route's doc comment).
  const full = searchParams.get("full") === "true";

  const where: Record<string, unknown> = {};
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
    return Response.json({ error: "from/to must be valid dates (ISO 8601)" }, { status: 400 });
  }
  if (category && !CATEGORY_VALUES.includes(category)) {
    return Response.json({ error: `category must be one of ${CATEGORY_VALUES.join(", ")}` }, { status: 400 });
  }

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
    if (fromDate) (where.date as Record<string, unknown>).gte = fromDate;
    if (toDate) (where.date as Record<string, unknown>).lte = toDate;
  }

  const orderBy: Record<string, string>[] = [];
  if (sort === "distance") orderBy.push({ distance: order });
  else if (sort === "duration") orderBy.push({ duration: order });
  else orderBy.push({ date: order });
  orderBy.push({ id: "desc" });

  // Select only the columns the web pages render — notably excluding the large
  // `routeEncoded`/`matchedPolyline` columns and the createdAt/updatedAt timestamps — unless a
  // full restore asked for everything.
  const [trips, total] = await Promise.all([
    prisma.trip.findMany({
      where,
      orderBy,
      ...(requestedPage !== null ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
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
          ...(includeRoute ? { routeEncoded: true } : {}),
          gasEntries: { select: { totalCost: true, paidBy: true } },
        },
    }),
    requestedPage !== null ? prisma.trip.count({ where }) : Promise.resolve(0),
  ]);
  return Response.json(requestedPage !== null ? { items: trips, total, page, pageSize } : trips);
});

export const POST = route(async (request: NextRequest) => {
  // Resolves place names, payer and vehicle (422 with suggestions if it can't), then creates.
  const trip = await createTripRecord(await readBody(request, TRIP_KNOWN_KEYS));
  return Response.json(trip, { status: 201 });
});

export const DELETE = route(async (request: NextRequest) => {
  const id = parseIdBody(await readBody(request, new Set(["id"])), "trip");
  // Remove the trip and everything tied to it. Gas entries reference the trip, so they must go
  // first (the FK has no cascade) — do both in one transaction so a trip is never left with
  // orphaned fuel rows. An unknown id surfaces as a 404 (Prisma P2025).
  await prisma.$transaction([
    prisma.gasEntry.deleteMany({ where: { tripId: id } }),
    prisma.trip.delete({ where: { id } }),
  ]);
  return Response.json({ success: true });
});

// Only a known set of editable fields is accepted — never spread arbitrary client JSON into the
// update. Trimming a trip rewrites geometry + stats + endpoints, hence the distance/route fields.
export const PATCH = route(async (request: NextRequest) => {
  const { id, data } = parseTripPatch(await readBody(request, TRIP_KNOWN_KEYS));
  const trip = await prisma.trip.update({ where: { id }, data: data as never });
  return Response.json(trip);
});
