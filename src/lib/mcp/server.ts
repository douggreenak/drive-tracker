import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { GET as statsGET } from "@/app/api/stats/route";
import { ApiError, errorResponse, parseDate } from "@/lib/api-input";
import { buildContext, createScheduledDrive, upcomingWhere, createTripRecord, resolveNames } from "@/lib/context";

const CATEGORIES = ["COMMUTE", "ERRAND", "ROAD_TRIP", "SCHOOL", "WORK", "LEISURE", "OTHER"] as const;
const FUEL_TYPES = ["REGULAR", "MIDGRADE", "PREMIUM", "DIESEL"] as const;

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}
function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const f = from ? parseDate(from) : undefined;
  const t = to ? parseDate(to) : undefined;
  if ((from && !f) || (to && !t)) throw new ApiError(400, "from/to must be valid dates (ISO 8601, e.g. 2026-11-26)");
  return { ...(f ? { gte: f } : {}), ...(t ? { lte: t } : {}) };
}

// Turn any thrown error (validation, unknown id, DB constraint) into a clear MCP tool error
// instead of an opaque protocol failure.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safe<A extends any[]>(handler: (...args: A) => Promise<any>) {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      const res = errorResponse(err);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      // 422s carry suggestions / valid options the assistant needs — pass the whole JSON through.
      return fail(res.status === 422 ? JSON.stringify(body, null, 2) : (body.error ?? "Request failed"));
    }
  };
}

// Trip columns safe to return to an LLM — excludes the large encoded route/polyline blobs.
const TRIP_SUMMARY = {
  id: true, date: true, endDate: true, name: true, startAddress: true, endAddress: true,
  distance: true, duration: true, category: true, isFavorite: true, paidBy: true,
  notes: true, vehicleName: true, estimatedGallons: true, isManualEntry: true, stops: true,
} as const;

export function createMcpServer() {
  const server = new McpServer({ name: "drive-tracker", version: "1.0.0" });
  // Every tool handler runs inside safe(); the override is runtime-only so tool arg types still infer.
  const register = server.registerTool.bind(server) as (n: string, c: unknown, h: never) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (name: string, config: unknown, handler: any) => register(name, config, safe(handler) as never);

  server.registerTool("get_stats", {
    description: "Overall driving and fuel statistics: totals, this week/month, cost per mile, avg MPG, category counts, and period-over-period comparison.",
    inputSchema: { period: z.enum(["30d", "90d", "12m"]).optional().describe("Comparison period (default 30d)") },
  }, async ({ period }) => {
    const res = await statsGET(new Request(`http://internal/api/stats${period ? `?period=${period}` : ""}`));
    return json(await res.json());
  });

  server.registerTool("list_trips", {
    description: "List trips, newest first by default. Distances are in miles, durations in seconds.",
    inputSchema: {
      search: z.string().optional().describe("Match against start/end address and notes"),
      category: z.enum(CATEGORIES).optional(),
      favoritesOnly: z.boolean().optional(),
      from: z.string().optional().describe("ISO date, inclusive"),
      to: z.string().optional().describe("ISO date, inclusive"),
      sort: z.enum(["date", "distance", "duration"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      limit: z.number().int().min(1).max(100).optional().describe("Default 25"),
      offset: z.number().int().min(0).optional(),
    },
  }, async (a) => {
    const range = dateRange(a.from, a.to);
    const where = {
      ...(a.search ? { OR: [
        { startAddress: { contains: a.search, mode: "insensitive" as const } },
        { endAddress: { contains: a.search, mode: "insensitive" as const } },
        { notes: { contains: a.search, mode: "insensitive" as const } },
      ] } : {}),
      ...(a.category ? { category: a.category } : {}),
      ...(a.favoritesOnly ? { isFavorite: true } : {}),
      ...(range ? { date: range } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.trip.findMany({
        where, select: TRIP_SUMMARY,
        orderBy: [{ [a.sort ?? "date"]: a.order ?? "desc" }, { id: "desc" }],
        skip: a.offset ?? 0, take: a.limit ?? 25,
      }),
      prisma.trip.count({ where }),
    ]);
    return json({ total, items });
  });

  server.registerTool("get_trip", {
    description: "Get one trip in full detail (without GPS track points), including linked gas entries.",
    inputSchema: { id: z.string() },
  }, async ({ id }) => {
    const trip = await prisma.trip.findUnique({
      where: { id },
      omit: { routeEncoded: true, matchedPolyline: true },
      include: { gasEntries: true, _count: { select: { trackPoints: true } } },
    });
    return trip ? json(trip) : fail(`Trip ${id} not found`);
  });

  server.registerTool("log_trip", {
    description: "Log a drive after the fact (manual entry). Place names (\"Home\", \"Fred Meyer\") are resolved against saved places and recent addresses; if one can't be resolved to a real street address the call fails with {unresolved, suggestions} — ask the user, don't guess. paidBy and vehicle default to the user's defaults (call get_context). For recorded GPS trips use the iOS app.",
    inputSchema: {
      date: z.string().optional().describe("ISO start time (default: now)"),
      startAddress: z.string().describe("Saved-place name or full street address"),
      endAddress: z.string().describe("Saved-place name or full street address"),
      stops: z.union([z.string(), z.array(z.string())]).optional(),
      distance: z.number().min(0).describe("Miles"),
      duration: z.number().int().min(0).describe("Seconds"),
      category: z.enum(CATEGORIES).optional(),
      paidBy: z.string().optional().describe("PayerGroup key or label; aliases like \"parents\"/\"me\" work. Default: user's default payer"),
      vehicle: z.string().optional().describe("Vehicle name (case-insensitive, partial ok). Default: user's default vehicle"),
      notes: z.string().optional(),
    },
  }, async (a) => json(await createTripRecord({ ...a, isManualEntry: true }, { manual: true })));

  server.registerTool("update_trip", {
    description: "Edit a trip's category, notes, favorite flag, or payer. Only provided fields change.",
    inputSchema: {
      id: z.string(),
      category: z.enum(CATEGORIES).optional(), notes: z.string().optional(),
      isFavorite: z.boolean().optional(), paidBy: z.string().optional(),
    },
  }, async ({ id, ...data }) => {
    if (Object.values(data).every((v) => v === undefined)) return fail("Provide at least one field to change");
    try {
      return json(await prisma.trip.update({ where: { id }, data, select: TRIP_SUMMARY }));
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return fail(`Trip ${id} not found`);
      throw err;
    }
  });

  server.registerTool("list_gas_entries", {
    description: "List fuel fill-ups, newest first.",
    inputSchema: {
      paidBy: z.string().optional(), fuelType: z.enum(FUEL_TYPES).optional(),
      from: z.string().optional(), to: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional().describe("Default 50"),
    },
  }, async (a) => json(await prisma.gasEntry.findMany({
    where: {
      ...(a.paidBy ? { paidBy: a.paidBy } : {}),
      ...(a.fuelType ? { fuelType: a.fuelType } : {}),
      ...(dateRange(a.from, a.to) ? { date: dateRange(a.from, a.to) } : {}),
    },
    orderBy: { date: "desc" }, take: a.limit ?? 50,
  })));

  server.registerTool("add_gas_entry", {
    description: "Record a fuel fill-up. totalCost is computed as gallons × pricePerGallon.",
    inputSchema: {
      date: z.string().describe("ISO date"),
      gallons: z.number().positive(), pricePerGallon: z.number().positive(),
      paidBy: z.string().default("SELF").describe("PayerGroup key"),
      fuelType: z.enum(FUEL_TYPES).default("REGULAR"),
      stationName: z.string().optional(), odometer: z.number().min(0).optional(),
      vehicleName: z.string().optional(), tripId: z.string().optional(),
    },
  }, async (a) => {
    const date = parseDate(a.date);
    if (!date) return fail("Invalid date: use ISO 8601, e.g. 2026-11-26");
    return json(await prisma.gasEntry.create({
      data: { ...a, date, totalCost: a.gallons * a.pricePerGallon },
    }));
  });

  server.registerTool("list_vehicles", { description: "List vehicles." }, async () =>
    json(await prisma.vehicle.findMany({ orderBy: { createdAt: "asc" } })));

  server.registerTool("list_scheduled_drives", {
    description: "List scheduled/recurring drives, soonest first.",
    inputSchema: {
      includeCanceled: z.boolean().optional(),
      upcomingOnly: z.boolean().optional().describe("Only drives departing today (local time) or later, plus repeating ones"),
    },
  }, async ({ includeCanceled, upcomingOnly }) => json(await prisma.scheduledDrive.findMany({
    where: {
      ...(includeCanceled ? {} : { isCanceled: false }),
      ...(upcomingOnly ? { OR: upcomingWhere().OR } : {}),
    },
    orderBy: { departure: "asc" },
  })));

  server.registerTool("create_scheduled_drive", {
    description: "Schedule a future drive. Place names (start/stops/end) are resolved against saved places and recent addresses; unresolvable ones fail with {unresolved, suggestions} — ask the user instead of guessing. paidBy and vehicle default to the user's defaults (see get_context). Give `date` (YYYY-MM-DD) + `departure_time` (\"11:18\" or \"11:18 AM\"), or a full ISO `departure`. `stops` may be a list of place names (or one string; separate several with `;`). Times without a UTC offset use `timezone` or the server default.",
    inputSchema: {
      date: z.string().optional().describe("YYYY-MM-DD"),
      departure_time: z.string().optional().describe("HH:mm or h:mm AM/PM"),
      departure: z.string().optional().describe("Full ISO 8601 departure; alternative to date + departure_time"),
      start: z.string().optional().describe("Defaults to \"Current location\""),
      stops: z.union([z.string(), z.array(z.string())]).optional(),
      end: z.string().optional().describe("Defaults to the last stop"),
      title: z.string().optional(), notes: z.string().optional(),
      category: z.enum(CATEGORIES).optional(),
      repeat: z.enum(["NONE", "DAILY", "WEEKDAYS", "WEEKLY"]).optional(),
      estimated_minutes: z.number().min(0).optional(),
      paidBy: z.string().optional().describe("PayerGroup key or label; aliases like \"parents\"/\"me\" work. Default: user's default payer"),
      vehicle: z.string().optional().describe("Vehicle name (case-insensitive, partial ok). Default: user's default vehicle"),
      timezone: z.string().optional().describe("IANA zone, e.g. America/Anchorage"),
    },
  }, async (a) => {
    return json(await createScheduledDrive(a));
  });

  server.registerTool("get_context", {
    description: "Call this FIRST before logging or scheduling a drive. Returns the user's timezone, defaults (payer, vehicle, home address), saved places, vehicles, payer groups, recent addresses/trips and upcoming scheduled drives (to avoid duplicates).",
  }, async () => json(await buildContext()));

  server.registerTool("resolve_places", {
    description: "Dry-run the place resolver: shows what address each name (\"Home\", \"Fred Meyer\") would resolve to, or suggestions if it can't be resolved.",
    inputSchema: { names: z.array(z.string()).min(1).max(10) },
  }, async ({ names }) => json({ results: await resolveNames(names) }));

  server.registerTool("list_saved_places", { description: "List saved places (Home, Work, …)." }, async () =>
    json(await prisma.savedPlace.findMany({ orderBy: { sortOrder: "asc" } })));

  server.registerTool("list_payer_groups", {
    description: "List payer groups (who pays for gas). Their `key` is what paidBy fields use.",
  }, async () => json(await prisma.payerGroup.findMany({ orderBy: { sortOrder: "asc" } })));

  server.registerTool("get_settings", { description: "App settings: budget, units, currency, fuel price, default payer." }, async () =>
    json(await prisma.settings.findFirst()));

  return server;
}
