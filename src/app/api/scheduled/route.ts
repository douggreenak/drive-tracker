import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

const REPEAT = ["NONE", "DAILY", "WEEKDAYS", "WEEKLY"];
const CATEGORIES = ["COMMUTE", "ERRAND", "SCHOOL", "WORK", "ROAD_TRIP", "LEISURE", "OTHER"];

// Coerce a client-supplied body into the allow-listed, validated columns. Shared by create/update
// so a client can never mass-assign arbitrary fields.
function sanitize(body: Record<string, unknown>) {
  const skipped = Array.isArray(body.skippedOccurrences)
    ? (body.skippedOccurrences as unknown[]).map(Number).filter((n) => Number.isFinite(n))
    : [];
  return {
    title: String(body.title ?? "Drive"),
    startAddress: String(body.startAddress ?? ""),
    endAddress: String(body.endAddress ?? ""),
    startLat: Number(body.startLat) || 0,
    startLng: Number(body.startLng) || 0,
    endLat: Number(body.endLat) || 0,
    endLng: Number(body.endLng) || 0,
    departure: new Date(String(body.departure)),
    estimatedTravelTime: Math.trunc(Number(body.estimatedTravelTime) || 0),
    scheduledArrival: new Date(String(body.scheduledArrival)),
    repeatRule: (REPEAT.includes(String(body.repeatRule)) ? body.repeatRule : "NONE") as "NONE" | "DAILY" | "WEEKDAYS" | "WEEKLY",
    category: (CATEGORIES.includes(String(body.category)) ? body.category : "COMMUTE") as
      | "COMMUTE" | "ERRAND" | "SCHOOL" | "WORK" | "ROAD_TRIP" | "LEISURE" | "OTHER",
    paidBy: (body.paidBy === "PARENTS" ? "PARENTS" : "SELF") as "SELF" | "PARENTS",
    vehicleName: body.vehicleName ? String(body.vehicleName) : null,
    notes: body.notes ? String(body.notes) : null,
    isEnabled: body.isEnabled !== false,
    isCanceled: body.isCanceled === true,
    lastStartedAt: body.lastStartedAt ? new Date(String(body.lastStartedAt)) : null,
    lastCompletedAt: body.lastCompletedAt ? new Date(String(body.lastCompletedAt)) : null,
    skippedOccurrences: skipped,
  };
}

export async function GET() {
  const drives = await prisma.scheduledDrive.findMany({ orderBy: { departure: "asc" } });
  return Response.json(drives);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid body" }, { status: 400 });
  const drive = await prisma.scheduledDrive.create({ data: sanitize(body) });
  return Response.json(drive, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  try {
    const drive = await prisma.scheduledDrive.update({ where: { id }, data: sanitize(body) });
    return Response.json(drive);
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json().catch(() => ({ id: null }));
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  await prisma.scheduledDrive.deleteMany({ where: { id } });
  return Response.json({ success: true });
}
