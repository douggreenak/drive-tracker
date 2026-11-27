// Prisma-backed glue: loads what the app knows (saved places, vehicles, payers, settings, recent
// addresses) and uses it to create trips / scheduled drives with no guessing. Shared by the REST
// routes and the MCP tools. The pure logic lives in ./resolve.ts and ./api-input.ts.
import { prisma } from "@/lib/db";
import { fillFromGeocoder, searchCenter, type Geocoder } from "@/lib/geocode";
import { estimateTravelSeconds } from "@/lib/route";
import { ApiError, parseScheduledCreateWithMeta, parseTripCreate, startOfLocalDay, type Stop } from "@/lib/api-input";
import {
  formatLocal, looksLikeStreetAddress, norm, resolveLocations, resolvePayer, resolveVehicle,
  type Lookup, type Place, type ResolvedLoc, type LocInput,
} from "@/lib/resolve";

const isReal = (a: string | null | undefined) => Boolean(a && a.trim() && !/^current location$/i.test(a.trim()));

// The owner is in Alaska. Without this fallback an unset APP_TIMEZONE made "11:30" mean 11:30 UTC
// (02:30 in Fairbanks) — already past, so the drive looked like it had vanished from "upcoming".
export const FALLBACK_TIMEZONE = "America/Anchorage";
export function appTimeZone(): string {
  return process.env.APP_TIMEZONE || FALLBACK_TIMEZONE;
}

/** Prisma `where` for "upcoming": enabled, not canceled, departing today (local) or later — or repeating. */
export function upcomingWhere(timeZone: string = appTimeZone()) {
  return {
    isCanceled: false,
    isEnabled: true,
    OR: [{ departure: { gte: startOfLocalDay(timeZone) } }, { repeatRule: { not: "NONE" as const } }],
  };
}

type RecentSource = {
  startAddress: string; startLat: number; startLng: number;
  endAddress: string; endLat: number; endLng: number;
  stops: unknown;
};

function recentPlaces(rows: RecentSource[], source: Place["source"]): Place[] {
  const out: Place[] = [];
  const add = (address: string, lat: number, lng: number) => {
    if (!isReal(address)) return;
    out.push({ label: address.split(",")[0].trim() && !/^\d/.test(address) ? address.split(",")[0].trim() : address, address, lat, lng, source });
  };
  for (const r of rows) {
    add(r.endAddress, r.endLat, r.endLng);
    add(r.startAddress, r.startLat, r.startLng);
    if (Array.isArray(r.stops)) {
      for (const s of r.stops as Array<{ address?: string; lat?: number; lng?: number }>) add(s?.address ?? "", Number(s?.lat) || 0, Number(s?.lng) || 0);
    }
  }
  return out;
}

export async function loadLookup(): Promise<Lookup & { settings: Awaited<ReturnType<typeof prisma.settings.findFirst>>; timezoneIsDefault: boolean; defaultVehicleSource: string | null; homeAddress: string | null }> {
  const sel = { startAddress: true, startLat: true, startLng: true, endAddress: true, endLat: true, endLng: true, stops: true } as const;
  const [places, vehicles, groups, settings, trips, scheduled] = await Promise.all([
    prisma.savedPlace.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.payerGroup.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.settings.findFirst(), // read-only: never creates the row
    prisma.trip.findMany({ orderBy: { date: "desc" }, take: 100, select: { ...sel, vehicleName: true } }),
    prisma.scheduledDrive.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: sel }),
  ]);

  const saved: Place[] = places.map((p) => ({ label: p.label, address: p.address, lat: p.lat, lng: p.lng, source: "saved_place" }));
  const recents = [...recentPlaces(trips, "recent_trip"), ...recentPlaces(scheduled, "scheduled_drive")];

  let defaultVehicle: string | null = null;
  let defaultVehicleSource: string | null = null;
  const envV = process.env.DEFAULT_VEHICLE?.trim();
  const byName = (n: string) => vehicles.find((v) => norm(v.name) === norm(n));
  if (envV && byName(envV)) { defaultVehicle = byName(envV)!.name; defaultVehicleSource = "DEFAULT_VEHICLE env"; }
  else if (vehicles.length === 1) { defaultVehicle = vehicles[0].name; defaultVehicleSource = "only vehicle"; }
  else {
    const last = trips.find((t) => t.vehicleName && byName(t.vehicleName));
    if (last) { defaultVehicle = byName(last.vehicleName!)!.name; defaultVehicleSource = "vehicle on most recent trip"; }
  }

  const home = saved.find((p) => norm(p.label) === "home" && looksLikeStreetAddress(p.address));
  return {
    places: saved,
    recents,
    payerGroups: groups.map((g) => ({ key: g.key, name: g.name, isArchived: g.isArchived })),
    vehicles: vehicles.map((v) => ({ name: v.name, avgMpg: v.avgMpg })),
    defaultPaidBy: settings?.defaultPaidBy ?? "SELF",
    defaultVehicle,
    timezone: appTimeZone(),
    timezoneIsDefault: !process.env.APP_TIMEZONE,
    settings,
    defaultVehicleSource,
    homeAddress: home?.address ?? null,
  };
}

/** Everything an assistant needs before logging / scheduling a drive, in one small payload. */
export async function buildContext() {
  const lookup = await loadLookup();
  const now = new Date();
  const [trips, upcoming, vehicles] = await Promise.all([
    prisma.trip.findMany({
      orderBy: { date: "desc" }, take: 10,
      select: { id: true, date: true, startAddress: true, endAddress: true, stops: true, distance: true, category: true, paidBy: true, vehicleName: true, notes: true },
    }),
    prisma.scheduledDrive.findMany({
      where: upcomingWhere(),
      orderBy: { departure: "asc" }, take: 20,
      select: { id: true, title: true, startAddress: true, endAddress: true, stops: true, departure: true, scheduledArrival: true, repeatRule: true, category: true, paidBy: true, vehicleName: true },
    }),
    prisma.vehicle.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const tz = lookup.timezone;
  const recentAddresses = new Map<string, { address: string; lat: number; lng: number }>();
  for (const p of lookup.recents) if (!recentAddresses.has(norm(p.address))) recentAddresses.set(norm(p.address), { address: p.address, lat: p.lat, lng: p.lng });

  return {
    now: now.toISOString(),
    timezone: tz,
    timezoneWarning: lookup.timezoneIsDefault ? `APP_TIMEZONE is not set on the server; using ${FALLBACK_TIMEZONE}. Set APP_TIMEZONE, or send an explicit \`timezone\`.` : undefined,
    settings: {
      defaultPaidBy: lookup.defaultPaidBy,
      defaultPaidByLabel: resolvePayer(undefined, lookup).label,
      defaultVehicle: lookup.defaultVehicle,
      defaultVehicleSource: lookup.defaultVehicleSource,
      homeAddress: lookup.homeAddress,
      currency: lookup.settings?.currency ?? "USD",
      distanceUnit: lookup.settings?.distanceUnit ?? "miles",
      fuelPricePerGallon: lookup.settings?.fuelPricePerGallon ?? null,
    },
    savedPlaces: lookup.places.map((p) => ({ name: p.label, address: p.address, lat: p.lat, lng: p.lng })),
    vehicles: vehicles.map((v) => ({ name: v.name, make: v.make, model: v.model, year: v.year, avgMpg: v.avgMpg, tankSize: v.tankSize, isDefault: v.name === lookup.defaultVehicle })),
    payerGroups: lookup.payerGroups.filter((g) => !g.isArchived).map((g) => ({ key: g.key, label: g.name, isDefault: g.key === lookup.defaultPaidBy })),
    recentAddresses: [...recentAddresses.values()].slice(0, 25),
    recentTrips: trips.map((t) => ({ ...t, dateLocal: formatLocal(t.date, tz) })),
    upcomingScheduled: upcoming.map((d) => ({ ...d, departureLocal: formatLocal(d.departure, tz) })),
    howTo: {
      scheduleDrive: "POST /api/scheduled {date:'YYYY-MM-DD', departure_time:'11:18 AM', start, stops:[names], end, paidBy?, vehicle?, notes?}",
      names: "Place names are resolved against savedPlaces and recentAddresses; unresolvable names return 422 {unresolved, suggestions} — ask the user, don't guess.",
    },
  };
}

// ---------- creating records ----------

function describePlaces(resolved: ResolvedLoc[]): string {
  return resolved.map((r) => (r.label && norm(r.label) !== norm(r.address) ? `${r.label} (${r.address})` : r.address)).join(" → ");
}

const publicLocs = (r: ResolvedLoc[]) =>
  r.map(({ field, input, address, lat, lng, label, matchedBy }) => ({ field, input, address, lat, lng, label, matchedBy }));

/** Resolve names against what is saved; a name that matches nothing saved is looked up on the map near Home before giving up. */
export async function resolveWithGeocoder(locs: LocInput[], lookup: Awaited<ReturnType<typeof loadLookup>>, geocoder?: Geocoder) {
  try { return resolveLocations(locs, lookup); }
  catch (e) {
    const body = (e as { httpBody?: { details?: { field: string; reason: string }[] } }).httpBody;
    const lookable = new Set((body?.details ?? []).filter((d) => d.reason === "not_found" || d.reason === "not_a_street_address").map((d) => d.field));
    if (!body || !lookable.size) throw e;
    const filled = await fillFromGeocoder(locs, lookable, searchCenter(lookup.places), geocoder);
    if (filled.every((l, i) => l === locs[i])) throw e;
    return resolveLocations(filled, lookup);
  }
}

export async function createScheduledDrive(raw: unknown) {
  const lookup = await loadLookup();
  // A missing start defaults to the saved "Home" (only when it has a real street address).
  const { data, startDefaulted, titleDefaulted } = parseScheduledCreateWithMeta(raw, {
    defaultTimeZone: lookup.timezone,
    defaultStart: lookup.homeAddress ?? undefined,
  });

  const locs: LocInput[] = [
    { field: "start", address: data.startAddress, lat: data.startLat, lng: data.startLng },
    ...(data.stops ?? []).map((s, i) => ({ field: `stops[${i}]`, address: s.address, lat: s.lat, lng: s.lng })),
    { field: "end", address: data.endAddress, lat: data.endLat, lng: data.endLng },
  ];
  const resolved = await resolveWithGeocoder(locs, lookup);
  const payer = resolvePayer(data.paidBy, lookup);
  const vehicle = resolveVehicle(data.vehicleName ?? undefined, lookup);

  const start = resolved[0];
  const end = resolved[resolved.length - 1];
  const stopRes = resolved.slice(1, -1);
  const stops: Stop[] | undefined = data.stops ? stopRes.map((r) => ({ address: r.address, lat: r.lat, lng: r.lng })) : undefined;
  const title = titleDefaulted ? defaultTitle([...stopRes, end]) : data.title;

  // No travel time and no arrival given: estimate the drive, so it does not arrive the moment it leaves.
  let travelEstimated = false;
  if (!data.estimatedTravelTime && data.scheduledArrival.getTime() === data.departure.getTime()) {
    const secs = await estimateTravelSeconds(resolved, lookup.places);
    if (secs) { data.estimatedTravelTime = secs; data.scheduledArrival = new Date(data.departure.getTime() + secs * 1000); travelEstimated = true; }
  }

  const created = await prisma.scheduledDrive.create({
    data: {
      ...data, title, paidBy: payer.key, vehicleName: vehicle?.name ?? null, stops,
      startAddress: start.address, startLat: start.lat, startLng: start.lng,
      endAddress: end.address, endLat: end.lat, endLng: end.lng,
    },
  });
  // A 2xx must mean the record exists: read it back before claiming success.
  const drive = await prisma.scheduledDrive.findUnique({ where: { id: created.id } });
  if (!drive) throw new ApiError(500, "The scheduled drive was not saved; nothing was created. Please retry.");

  const tz = lookup.timezone;
  const departureLocal = formatLocal(drive.departure, tz);
  const arrivalLocal = formatLocal(drive.scheduledArrival, tz);
  const upcoming = drive.departure >= startOfLocalDay(tz) || drive.repeatRule !== "NONE";
  return {
    ...drive,
    created: true,
    timezone: tz,
    departureLocal,
    scheduledArrivalLocal: arrivalLocal,
    paidByLabel: payer.label,
    vehicle: vehicle ? { name: vehicle.name, avgMpg: vehicle.avgMpg ?? null } : null,
    resolvedLocations: publicLocs(resolved),
    defaultsApplied: [
      ...(startDefaulted ? [`start → ${start.matchedBy === "current_location" ? "Current location" : "Home"}`] : []),
      ...(data.paidBy ? [] : [`paidBy → ${payer.label}`]),
      ...(data.vehicleName || !vehicle ? [] : [`vehicle → ${vehicle.name}`]),
      ...(travelEstimated ? [`travel time → about ${Math.round(drive.estimatedTravelTime / 60)} min (estimated driving time)`] : []),
    ],
    appearsInUpcoming: upcoming,
    summary: `Scheduled "${drive.title}": ${describePlaces(resolved)}, departing ${departureLocal}` +
      (drive.estimatedTravelTime ? `, arriving about ${arrivalLocal}` : "") +
      `. Gas paid by ${payer.label}` + (vehicle ? `; vehicle: ${vehicle.name}` : "") + ".",
  };
}

function defaultTitle(places: ResolvedLoc[]): string {
  const names: string[] = [];
  for (const p of places) {
    const n = p.label ?? p.address.split(",")[0].trim();
    if (n && names[names.length - 1] !== n) names.push(n);
  }
  return `Drive to ${names.join(", then ")}`;
}

export async function createTripRecord(raw: unknown, opts: { manual?: boolean } = {}) {
  const lookup = await loadLookup();
  const data = parseTripCreate(raw) as Record<string, unknown> & {
    startAddress: string; endAddress: string; startLat: number; startLng: number; endLat: number; endLng: number;
    stops?: Stop[]; paidBy?: string; vehicleName: string | null; vehicleMpg: number | null; date: Date; endDate: Date | null;
  };

  const locs: LocInput[] = [
    { field: "start", address: data.startAddress, lat: data.startLat, lng: data.startLng },
    ...(data.stops ?? []).map((s, i) => ({ field: `stops[${i}]`, address: s.address, lat: s.lat, lng: s.lng })),
    { field: "end", address: data.endAddress, lat: data.endLat, lng: data.endLng },
  ];
  const resolved = await resolveWithGeocoder(locs, lookup);
  const payer = resolvePayer(data.paidBy, lookup);
  const vehicle = resolveVehicle(data.vehicleName ?? undefined, lookup);
  const start = resolved[0];
  const end = resolved[resolved.length - 1];
  const stops = data.stops ? resolved.slice(1, -1).map((r) => ({ address: r.address, lat: r.lat, lng: r.lng })) : undefined;

  const created = await prisma.trip.create({
    data: {
      ...data, paidBy: payer.key, vehicleName: vehicle?.name ?? null,
      vehicleMpg: data.vehicleMpg ?? vehicle?.avgMpg ?? null,
      stops, isManualEntry: opts.manual ? true : (data.isManualEntry as boolean),
      startAddress: start.address, startLat: start.lat, startLng: start.lng,
      endAddress: end.address, endLat: end.lat, endLng: end.lng,
    } as never,
  });
  const trip = await prisma.trip.findUnique({ where: { id: created.id } });
  if (!trip) throw new ApiError(500, "The trip was not saved; nothing was created. Please retry.");

  const tz = lookup.timezone;
  const dateLocal = formatLocal(trip.date, tz);
  return {
    ...trip,
    created: true,
    timezone: tz,
    dateLocal,
    paidByLabel: payer.label,
    vehicle: vehicle ? { name: vehicle.name, avgMpg: vehicle.avgMpg ?? null } : null,
    resolvedLocations: publicLocs(resolved),
    summary: `Logged trip: ${describePlaces(resolved)} on ${dateLocal}, ${trip.distance} mi. Gas paid by ${payer.label}` +
      (vehicle ? `; vehicle: ${vehicle.name}` : "") + ".",
  };
}

/** Dry-run: how would these names resolve? Backs GET /api/resolve and the MCP `resolve_places` tool. */
export async function resolveNames(names: string[]) {
  const lookup = await loadLookup();
  return Promise.all(names.map(async (name) => {
    try {
      const [r] = await resolveWithGeocoder([{ field: "name", address: name, lat: 0, lng: 0 }], lookup);
      const real = r.matchedBy === "current_location" || r.matchedBy === "coordinates" || r.matchedBy === "saved_place" || looksLikeStreetAddress(r.address);
      if (!real) return { input: name, ok: false as const, error: `"${name}" has no real street address`, hint: "Ask the user for the full street address (number, street, city, state).", suggestions: [] };
      return { input: name, ok: true as const, address: r.address, lat: r.lat, lng: r.lng, label: r.label, matchedBy: r.matchedBy };
    } catch (e) {
      const body = (e as { httpBody?: Record<string, unknown> }).httpBody;
      if (!body) throw e;
      return { input: name, ok: false as const, error: body.error, hint: body.hint, suggestions: body.suggestions };
    }
  }));
}
