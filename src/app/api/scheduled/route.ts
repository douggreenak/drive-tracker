import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import {
  ApiError, SCHEDULED_KNOWN_KEYS, parseIdBody, parseScheduledCreate, parseScheduledPatch, readBody, route,
} from "@/lib/api-input";

// Wall-clock `date` + `departure_time` values without a UTC offset are read in this IANA zone
// (a `timezone` field in the body overrides it). Falls back to UTC.
const defaultTimeZone = () => process.env.APP_TIMEZONE || "UTC";

export const GET = route(async () => {
  const drives = await prisma.scheduledDrive.findMany({ orderBy: { departure: "asc" } });
  return Response.json(drives);
});

// Accepts the documented object body, the same object wrapped in one field (e.g. {"scheduled": {...}}),
// or JSON-encoded as a string — and either native fields (`departure` ISO, `startAddress`, ...) or the
// friendly ones (`date`, `departure_time`, `start`, `end`, `stops`). Bad input → 400/422 JSON, never 500.
export const POST = route(async (request: NextRequest) => {
  const body = await readBody(request, SCHEDULED_KNOWN_KEYS);
  const data = parseScheduledCreate(body, { defaultTimeZone: defaultTimeZone() });
  const drive = await prisma.scheduledDrive.create({ data });
  return Response.json(drive, { status: 201 });
});

// Partial update: only keys present in the body change.
export const PATCH = route(async (request: NextRequest) => {
  const body = await readBody(request, SCHEDULED_KNOWN_KEYS);
  const { id, data } = parseScheduledPatch(body, { defaultTimeZone: defaultTimeZone() });
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields in body");
  const drive = await prisma.scheduledDrive.update({ where: { id }, data });
  return Response.json(drive);
});

export const DELETE = route(async (request: NextRequest) => {
  const id = parseIdBody(await readBody(request, new Set(["id"])), "scheduled drive");
  await prisma.scheduledDrive.deleteMany({ where: { id } });
  return Response.json({ success: true });
});
