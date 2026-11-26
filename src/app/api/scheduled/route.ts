import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import {
  ApiError, SCHEDULED_KNOWN_KEYS, parseIdBody, parseScheduledPatch, readBody, route,
} from "@/lib/api-input";
import { appTimeZone, createScheduledDrive, upcomingWhere } from "@/lib/context";

// Wall-clock `date` + `departure_time` values without a UTC offset are read in the body's `timezone`,
// else APP_TIMEZONE, else UTC (see appTimeZone in lib/context.ts).
const defaultTimeZone = () => appTimeZone();

// `?upcoming=true` → only enabled, non-canceled drives departing today (local time) or later, plus repeating ones;
// `?limit=` caps the count. Lets an assistant check for duplicates cheaply.
export const GET = route(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const upcoming = sp.get("upcoming") === "true";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 0, 0), 200);
  const drives = await prisma.scheduledDrive.findMany({
    where: upcoming
      ? upcomingWhere()
      : undefined,
    orderBy: { departure: "asc" },
    ...(limit ? { take: limit } : {}),
  });
  return Response.json(drives);
});

// Accepts the documented object body, the same object wrapped in one field (e.g. {"scheduled": {...}}),
// or JSON-encoded as a string — and either native fields (`departure` ISO, `startAddress`, ...) or the
// friendly ones (`date`, `departure_time`, `start`, `end`, `stops`). Bad input → 400/422 JSON, never 500.
export const POST = route(async (request: NextRequest) => {
  const body = await readBody(request, SCHEDULED_KNOWN_KEYS);
  // Resolves place names, payer and vehicle (422 with suggestions if it can't), then creates.
  return Response.json(await createScheduledDrive(body), { status: 201 });
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
