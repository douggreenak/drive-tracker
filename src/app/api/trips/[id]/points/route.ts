import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

// A trip's full GPS track, kept off the main trip payload (see `TrackPoint`'s schema doc comment)
// — a single trip can carry well over a thousand points, and the trip list/detail views never
// need them all. The iOS client uploads a trip's points here right after creating the trip, and a
// fresh install restoring from the cloud fetches them back the same way.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const points = await prisma.trackPoint.findMany({
    where: { tripId: id },
    orderBy: { seq: "asc" },
    select: { seq: true, t: true, lat: true, lng: true, speed: true, course: true, accuracy: true, altitude: true, onRoad: true },
  });
  return Response.json(points);
}

// Replaces this trip's points wholesale rather than appending — the client always sends its full,
// final track for a trip in one shot (trips aren't edited point-by-point), so treating a resend as
// idempotent (delete then insert) means a retried upload after a dropped connection can't
// duplicate points.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.points)) return Response.json({ error: "Missing points array" }, { status: 400 });

  const trip = await prisma.trip.findUnique({ where: { id }, select: { id: true } });
  if (!trip) return Response.json({ error: "Trip not found" }, { status: 404 });

  const points = (body.points as Record<string, unknown>[]).map((p) => ({
    tripId: id,
    seq: Math.trunc(Number(p.seq) || 0),
    t: new Date(String(p.t)),
    lat: Number(p.lat) || 0,
    lng: Number(p.lng) || 0,
    speed: Number(p.speed) || 0,
    course: Number(p.course) || 0,
    accuracy: Number(p.accuracy) || 0,
    altitude: Number(p.altitude) || 0,
    onRoad: p.onRoad === true,
  }));

  await prisma.$transaction([
    prisma.trackPoint.deleteMany({ where: { tripId: id } }),
    prisma.trackPoint.createMany({ data: points }),
  ]);
  return Response.json({ success: true, count: points.length }, { status: 201 });
}
