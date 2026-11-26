// Input handling shared by the REST routes and the MCP tools: lenient body parsing (plain object,
// wrapped object, or JSON-encoded string), time/date/stop normalisation, and JSON error responses.
// Deliberately dependency-free (no Prisma / Next imports) so it can be unit-tested with `node --test`.

export class ApiError extends Error {
  status: number;
  details?: Array<{ field: string; message: string }>;
  constructor(status: number, message: string, details?: Array<{ field: string; message: string }>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const CATEGORIES = ["COMMUTE", "ERRAND", "ROAD_TRIP", "SCHOOL", "WORK", "LEISURE", "OTHER"] as const;
export const REPEAT_RULES = ["NONE", "DAILY", "WEEKDAYS", "WEEKLY"] as const;
export type Category = (typeof CATEGORIES)[number];
export type RepeatRule = (typeof REPEAT_RULES)[number];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------- body parsing ----------

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

/**
 * Turn whatever a client sent into the object it meant. Handles:
 *   {...}                        – the documented shape
 *   "{...}"                      – a JSON-encoded string
 *   {"scheduled": {...}}         – wrapped in a single field (any single key not in `knownKeys`)
 *   {"scheduled": "{...}"}       – wrapped AND stringified (the personal-assistant connector case)
 * Throws ApiError(400) if no object can be recovered.
 */
export function unwrapPayload(raw: unknown, knownKeys: ReadonlySet<string>): Obj {
  let cur = raw;
  for (let i = 0; i < 4; i++) {
    if (typeof cur === "string") {
      const parsed = tryParseJson(cur.trim());
      if (parsed === undefined) break;
      cur = parsed;
      continue;
    }
    if (isObj(cur)) {
      const keys = Object.keys(cur);
      if (keys.length === 1 && !knownKeys.has(keys[0])) {
        const inner = cur[keys[0]];
        if (isObj(inner) || (typeof inner === "string" && /^\s*[{"]/.test(inner))) { cur = inner; continue; }
      }
      return cur;
    }
    break;
  }
  throw new ApiError(400, "Request body must be a JSON object (optionally wrapped in a single field and/or JSON-encoded as a string)");
}

/** Read + parse a request body, returning a JSON-object-or-throw. `required:false` allows empty. */
export async function readBody(request: Request, knownKeys: ReadonlySet<string>): Promise<Obj> {
  const text = await request.text().catch(() => "");
  if (!text.trim()) throw new ApiError(400, "Request body is empty; expected a JSON object");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new ApiError(400, "Request body is not valid JSON"); }
  return unwrapPayload(raw, knownKeys);
}

// ---------- scalar coercion ----------

/** "snake_case" / "kebab-case" → camelCase, so clients can use either. */
export function camelKeys(o: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) {
    const c = k.replace(/[_-]+([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase());
    if (!(c in out) || k === c) out[c] = v;
  }
  return out;
}

export function str(v: unknown): string | undefined {
  if (typeof v === "string") { const t = v.trim(); return t === "" ? undefined : t; }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

export function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  return undefined;
}

export function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return undefined;
}

/** Parse a date / datetime. Returns undefined when it isn't a real date. Accepts epoch ms numbers. */
export function parseDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === "number") { const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d; }
  if (typeof v !== "string" || !v.trim()) return undefined;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** "11:18", "11:18 AM", "11:18am", "7pm", "7 p.m.", "23:05", "11:18:30" → {h, m, s}. */
export function parseTimeOfDay(v: unknown): { h: number; m: number; s: number } | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap])?\.?\s*(?:m\.?)?\s*$/i.exec(v);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  const mer = m[4]?.toLowerCase();
  if (m[2] === undefined && !mer) return undefined; // bare "11" is ambiguous
  if (mer) {
    if (h < 1 || h > 12) return undefined;
    h = (h % 12) + (mer === "p" ? 12 : 0);
  }
  if (h > 23 || min > 59 || s > 59) return undefined;
  return { h, m: min, s };
}

/** Milliseconds that `timeZone` is ahead of UTC at instant `at`. */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - at.getTime();
}

/** Wall-clock date + time in an IANA zone (or UTC) → the real instant. */
export function zonedInstant(
  ymd: { y: number; mo: number; d: number }, t: { h: number; m: number; s: number }, timeZone: string,
): Date {
  const asUtc = Date.UTC(ymd.y, ymd.mo - 1, ymd.d, t.h, t.m, t.s);
  if (timeZone === "UTC") return new Date(asUtc);
  const guess = asUtc - zoneOffsetMs(timeZone, new Date(asUtc));
  return new Date(asUtc - zoneOffsetMs(timeZone, new Date(guess)));
}

export function validTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

// ---------- stops ----------

export type Stop = { address: string; lat: number; lng: number };

/**
 * Stops as an array of names, an array of {address,lat,lng}-ish objects, or one string (several
 * stops separated by `;`, `|` or newlines — commas are NOT separators since addresses contain them).
 * Returns undefined when nothing usable was supplied.
 */
export function normalizeStops(v: unknown, errors?: string[]): Stop[] | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  let items: unknown[];
  if (typeof v === "string") {
    const parsed = /^\s*\[/.test(v) ? tryParseJson(v) : undefined;
    items = Array.isArray(parsed) ? parsed : v.split(/[;|\n]+/);
  } else if (Array.isArray(v)) items = v;
  else if (isObj(v)) items = [v];
  else { errors?.push("stops must be an array of names, an array of objects, or a string"); return undefined; }

  const out: Stop[] = [];
  items.forEach((it, i) => {
    if (typeof it === "string") {
      const a = it.trim();
      if (a) out.push({ address: a, lat: 0, lng: 0 });
    } else if (isObj(it)) {
      const o = camelKeys(it);
      const address = str(o.address) ?? str(o.name) ?? str(o.title) ?? str(o.label);
      const lat = num(o.lat ?? o.latitude) ?? 0;
      const lng = num(o.lng ?? o.lon ?? o.longitude) ?? 0;
      if (address || lat || lng) out.push({ address: address ?? "", lat, lng });
      else errors?.push(`stops[${i}] needs an address (or lat/lng)`);
    } else if (it !== null && it !== undefined) errors?.push(`stops[${i}] must be a string or object`);
  });
  return out;
}

// ---------- scheduled drives ----------

const SCHEDULED_KEYS = new Set([
  "title", "startAddress", "endAddress", "startLat", "startLng", "endLat", "endLng", "departure",
  "estimatedTravelTime", "scheduledArrival", "repeatRule", "category", "paidBy", "vehicleName", "notes",
  "stops", "isEnabled", "isCanceled", "lastStartedAt", "lastCompletedAt", "skippedOccurrences",
  "canceledOccurrences", "id", "date", "departureTime", "time", "start", "end", "timezone",
]);
export const SCHEDULED_KNOWN_KEYS: ReadonlySet<string> = SCHEDULED_KEYS;

export type ScheduledInput = {
  title: string; startAddress: string; endAddress: string;
  startLat: number; startLng: number; endLat: number; endLng: number;
  departure: Date; estimatedTravelTime: number; scheduledArrival: Date;
  repeatRule: RepeatRule; category: Category; paidBy: string;
  vehicleName: string | null; notes: string | null; stops: Stop[] | undefined;
  isEnabled: boolean; isCanceled: boolean;
  lastStartedAt: Date | null; lastCompletedAt: Date | null;
  skippedOccurrences: number[]; canceledOccurrences: number[];
};

function fail(errors: Array<{ field: string; message: string }>): never {
  throw new ApiError(422, errors.map((e) => `${e.field}: ${e.message}`).join("; "), errors);
}

function enumValue<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const s = typeof v === "string" ? v.trim().toUpperCase().replace(/[\s-]+/g, "_") : undefined;
  return allowed.find((a) => a === s);
}

function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => num(x)).filter((n): n is number => n !== undefined) : [];
}

/**
 * Resolve the departure instant from either the native `departure` (ISO) or the friendly
 * `date` ("2026-11-26") + `departure_time` ("11:18" / "11:18 AM") pair. Wall-clock values without a
 * UTC offset are interpreted in `timezone` (IANA name in the body) or the APP_TIMEZONE env var,
 * falling back to UTC.
 */
function resolveDeparture(o: Obj, defaultTz: string, errors: Array<{ field: string; message: string }>): Date | undefined {
  const tz = str(o.timezone) ?? defaultTz;
  if (!validTimeZone(tz)) { errors.push({ field: "timezone", message: `unknown IANA time zone "${tz}"` }); return undefined; }
  const timeRaw = o.departureTime ?? o.time;
  const dateRaw = o.date;

  if (o.departure !== undefined && o.departure !== null && o.departure !== "") {
    const dep = o.departure;
    // A bare "2026-11-26T11:18" has no offset → treat as wall-clock in tz; anything with Z/offset is exact.
    if (typeof dep === "string") {
      const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(dep.trim());
      if (m) return zonedInstant({ y: +m[1], mo: +m[2], d: +m[3] }, { h: +m[4], m: +m[5], s: +(m[6] ?? 0) }, tz);
      // "11:18" in `departure` together with a date
      const t = parseTimeOfDay(dep);
      if (t && dateRaw !== undefined) return fromDateAndTime(dateRaw, t, tz, errors);
    }
    const d = parseDate(dep);
    if (!d) errors.push({ field: "departure", message: "not a valid date/time (use ISO 8601, e.g. 2026-11-26T11:18:00-09:00)" });
    return d;
  }

  if (dateRaw === undefined || dateRaw === null || dateRaw === "") {
    errors.push({ field: "departure", message: 'required: send "departure" (ISO 8601) or "date" (YYYY-MM-DD) plus "departure_time" (e.g. "11:18" or "11:18 AM")' });
    return undefined;
  }
  // `date` may itself be a full datetime.
  if (timeRaw === undefined || timeRaw === null || timeRaw === "") {
    if (typeof dateRaw === "string" && /[T ]\d{1,2}:\d{2}/.test(dateRaw)) {
      const d = parseDate(dateRaw);
      if (d) return d;
    }
    errors.push({ field: "departure_time", message: 'required when only "date" is given (e.g. "11:18" or "11:18 AM")' });
    return undefined;
  }
  const t = parseTimeOfDay(timeRaw);
  if (!t) { errors.push({ field: "departure_time", message: `could not parse "${String(timeRaw)}"; use "HH:mm" or "h:mm AM/PM"` }); return undefined; }
  return fromDateAndTime(dateRaw, t, tz, errors);
}

function fromDateAndTime(dateRaw: unknown, t: { h: number; m: number; s: number }, tz: string, errors: Array<{ field: string; message: string }>): Date | undefined {
  const m = typeof dateRaw === "string" ? /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/.exec(dateRaw) : null;
  if (!m) { errors.push({ field: "date", message: 'must be YYYY-MM-DD, e.g. "2026-11-26"' }); return undefined; }
  const y = +m[1], mo = +m[2], d = +m[3];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    errors.push({ field: "date", message: `"${String(dateRaw)}" is not a real calendar date` });
    return undefined;
  }
  return zonedInstant({ y, mo, d }, t, tz);
}

/**
 * Validate + normalise a scheduled-drive create body into DB-ready columns.
 * Missing optional fields get defaults; problems throw ApiError(422) listing every bad field.
 */
export function parseScheduledCreate(raw: unknown, opts: { defaultTimeZone?: string } = {}): ScheduledInput {
  const o = camelKeys(unwrapPayload(raw, SCHEDULED_KEYS));
  const errors: Array<{ field: string; message: string }> = [];
  const stopErrs: string[] = [];

  const departure = resolveDeparture(o, opts.defaultTimeZone ?? "UTC", errors);

  const stops = normalizeStops(o.stops, stopErrs);
  stopErrs.forEach((m) => errors.push({ field: "stops", message: m }));

  const startAddress = str(o.startAddress) ?? str(o.start) ?? "Current location";
  const endAddress = str(o.endAddress) ?? str(o.end) ?? (stops?.length ? stops[stops.length - 1].address : undefined);
  if (!endAddress) errors.push({ field: "end", message: 'required: destination address (or at least one stop)' });

  let category: Category = "COMMUTE";
  if (o.category !== undefined && o.category !== null && o.category !== "") {
    const c = enumValue(o.category, CATEGORIES);
    if (c) category = c; else errors.push({ field: "category", message: `must be one of ${CATEGORIES.join(", ")}` });
  }
  let repeatRule: RepeatRule = "NONE";
  const rr = o.repeatRule ?? o.repeat;
  if (rr !== undefined && rr !== null && rr !== "") {
    const r = enumValue(rr, REPEAT_RULES);
    if (r) repeatRule = r; else errors.push({ field: "repeatRule", message: `must be one of ${REPEAT_RULES.join(", ")}` });
  }

  let travel = 0;
  if (o.estimatedTravelTime !== undefined && o.estimatedTravelTime !== null && o.estimatedTravelTime !== "") {
    const n = num(o.estimatedTravelTime);
    if (n === undefined || n < 0) errors.push({ field: "estimatedTravelTime", message: "must be a non-negative number of seconds" });
    else travel = Math.trunc(n);
  } else if (o.estimatedMinutes !== undefined) {
    const n = num(o.estimatedMinutes);
    if (n === undefined || n < 0) errors.push({ field: "estimatedMinutes", message: "must be a non-negative number" });
    else travel = Math.round(n * 60);
  }

  let scheduledArrival: Date | undefined;
  if (o.scheduledArrival !== undefined && o.scheduledArrival !== null && o.scheduledArrival !== "") {
    scheduledArrival = parseDate(o.scheduledArrival);
    if (!scheduledArrival) errors.push({ field: "scheduledArrival", message: "not a valid date/time" });
  }

  const optDate = (k: string): Date | null => {
    const v = o[k];
    if (v === undefined || v === null || v === "") return null;
    const d = parseDate(v);
    if (!d) errors.push({ field: k, message: "not a valid date/time" });
    return d ?? null;
  };
  const lastStartedAt = optDate("lastStartedAt");
  const lastCompletedAt = optDate("lastCompletedAt");

  const coord = (k: string) => {
    if (o[k] === undefined || o[k] === null || o[k] === "") return 0;
    const n = num(o[k]);
    if (n === undefined) { errors.push({ field: k, message: "must be a number" }); return 0; }
    return n;
  };
  const startLat = coord("startLat"), startLng = coord("startLng"), endLat = coord("endLat"), endLng = coord("endLng");

  if (errors.length || !departure) fail(errors.length ? errors : [{ field: "departure", message: "required" }]);

  return {
    title: str(o.title) ?? `Drive to ${stops?.length && !str(o.endAddress ?? o.end) ? stops[stops.length - 1].address : endAddress}`,
    startAddress, endAddress: endAddress!, startLat, startLng, endLat, endLng,
    departure, estimatedTravelTime: travel,
    scheduledArrival: scheduledArrival ?? new Date(departure.getTime() + travel * 1000),
    repeatRule, category,
    paidBy: str(o.paidBy) ?? "SELF",
    vehicleName: str(o.vehicleName) ?? null,
    notes: str(o.notes) ?? null,
    stops,
    isEnabled: bool(o.isEnabled) ?? true,
    isCanceled: bool(o.isCanceled) ?? false,
    lastStartedAt, lastCompletedAt,
    skippedOccurrences: numArray(o.skippedOccurrences),
    canceledOccurrences: numArray(o.canceledOccurrences),
  };
}

/** Partial update: only keys present are validated and returned. `id` is returned separately. */
export function parseScheduledPatch(raw: unknown, opts: { defaultTimeZone?: string } = {}): { id: string; data: Record<string, unknown> } {
  const o = camelKeys(unwrapPayload(raw, SCHEDULED_KNOWN_KEYS));
  const id = str(o.id);
  if (!id) throw new ApiError(400, 'Missing "id" of the scheduled drive to update');
  const errors: Array<{ field: string; message: string }> = [];
  const data: Record<string, unknown> = {};
  const has = (k: string) => o[k] !== undefined;

  for (const k of ["title", "startAddress", "endAddress", "paidBy"] as const) {
    if (has(k)) { const s = str(o[k]); if (s) data[k] = s; else if (k === "startAddress" || k === "endAddress") data[k] = ""; else errors.push({ field: k, message: "must be a non-empty string" }); }
  }
  for (const k of ["vehicleName", "notes"] as const) if (has(k)) data[k] = str(o[k]) ?? null;
  for (const k of ["startLat", "startLng", "endLat", "endLng", "estimatedTravelTime"] as const) {
    if (has(k)) { const n = num(o[k]); if (n === undefined) errors.push({ field: k, message: "must be a number" }); else data[k] = k === "estimatedTravelTime" ? Math.trunc(n) : n; }
  }
  if (has("departure") || has("date") || has("departureTime") || has("time")) {
    const d = resolveDeparture(o, opts.defaultTimeZone ?? "UTC", errors);
    if (d) data.departure = d;
  }
  for (const k of ["scheduledArrival"] as const) if (has(k)) {
    const d = parseDate(o[k]); if (d) data[k] = d; else errors.push({ field: k, message: "not a valid date/time" });
  }
  for (const k of ["lastStartedAt", "lastCompletedAt"] as const) if (has(k)) {
    if (o[k] === null || o[k] === "") data[k] = null;
    else { const d = parseDate(o[k]); if (d) data[k] = d; else errors.push({ field: k, message: "not a valid date/time" }); }
  }
  if (has("repeatRule")) { const r = enumValue(o.repeatRule, REPEAT_RULES); if (r) data.repeatRule = r; else errors.push({ field: "repeatRule", message: `must be one of ${REPEAT_RULES.join(", ")}` }); }
  if (has("category")) { const c = enumValue(o.category, CATEGORIES); if (c) data.category = c; else errors.push({ field: "category", message: `must be one of ${CATEGORIES.join(", ")}` }); }
  for (const k of ["isEnabled", "isCanceled"] as const) if (has(k)) {
    const b = bool(o[k]); if (b === undefined) errors.push({ field: k, message: "must be true or false" }); else data[k] = b;
  }
  for (const k of ["skippedOccurrences", "canceledOccurrences"] as const) if (has(k)) {
    if (Array.isArray(o[k])) data[k] = numArray(o[k]); else errors.push({ field: k, message: "must be an array of numbers" });
  }
  if (has("stops")) {
    const se: string[] = [];
    const s = normalizeStops(o.stops, se);
    se.forEach((m) => errors.push({ field: "stops", message: m }));
    if (s) data.stops = s;
  }
  if (errors.length) fail(errors);
  return { id, data };
}

// ---------- trips ----------

export const TRIP_KNOWN_KEYS: ReadonlySet<string> = new Set([
  "id", "date", "endDate", "startAddress", "endAddress", "startLat", "startLng", "endLat", "endLng",
  "distance", "duration", "movingSeconds", "maxSpeed", "avgSpeed", "notes", "name", "routeEncoded",
  "matchedPolyline", "matchedFraction", "usedRouteMatching", "category", "isFavorite", "paidBy",
  "vehicleName", "vehicleMpg", "estimatedGallons", "scheduledDeparture", "scheduledArrival",
  "journeyId", "legIndex", "legTotal", "isManualEntry", "stops",
]);

type FieldErr = { field: string; message: string };

function reader(o: Obj, errors: FieldErr[]) {
  const present = (k: string) => o[k] !== undefined && o[k] !== null && o[k] !== "";
  return {
    present,
    number(k: string, opts: { min?: number; int?: boolean } = {}): number | undefined {
      if (!present(k)) return undefined;
      const n = num(o[k]);
      if (n === undefined || (opts.min !== undefined && n < opts.min)) {
        errors.push({ field: k, message: `must be a number${opts.min !== undefined ? ` >= ${opts.min}` : ""}` });
        return undefined;
      }
      return opts.int ? Math.trunc(n) : n;
    },
    date(k: string): Date | undefined {
      if (!present(k)) return undefined;
      const d = parseDate(o[k]);
      if (!d) errors.push({ field: k, message: "not a valid date/time (use ISO 8601)" });
      return d;
    },
    category(k = "category"): Category | undefined {
      if (!present(k)) return undefined;
      const c = enumValue(o[k], CATEGORIES);
      if (!c) errors.push({ field: k, message: `must be one of ${CATEGORIES.join(", ")}` });
      return c;
    },
    bool(k: string): boolean | undefined {
      if (o[k] === undefined || o[k] === null) return undefined;
      const b = bool(o[k]);
      if (b === undefined) errors.push({ field: k, message: "must be true or false" });
      return b;
    },
  };
}

export function parseTripCreate(raw: unknown): Record<string, unknown> {
  const o = camelKeys(unwrapPayload(raw, TRIP_KNOWN_KEYS));
  const errors: FieldErr[] = [];
  const r = reader(o, errors);

  const date = r.date("date") ?? (r.present("date") ? undefined : new Date());
  const distance = r.number("distance", { min: 0 });
  const duration = r.number("duration", { min: 0, int: true });
  if (!r.present("distance")) errors.push({ field: "distance", message: "required (miles)" });
  if (!r.present("duration")) errors.push({ field: "duration", message: "required (seconds)" });
  const coord = (k: string) => r.number(k) ?? 0;
  const startLat = coord("startLat"), startLng = coord("startLng"), endLat = coord("endLat"), endLng = coord("endLng");
  const category = r.category() ?? "OTHER";
  const endDate = r.date("endDate");
  const scheduledDeparture = r.date("scheduledDeparture");
  const scheduledArrival = r.date("scheduledArrival");
  const movingSeconds = r.number("movingSeconds", { min: 0, int: true });
  const maxSpeed = r.number("maxSpeed", { min: 0 });
  const avgSpeed = r.number("avgSpeed", { min: 0 });
  const matchedFraction = r.number("matchedFraction", { min: 0 });
  const vehicleMpg = r.number("vehicleMpg", { min: 0 });
  const estimatedGallons = r.number("estimatedGallons", { min: 0 });
  const legIndex = r.number("legIndex", { min: 0, int: true });
  const legTotal = r.number("legTotal", { min: 1, int: true });
  const isFavorite = r.bool("isFavorite");
  const usedRouteMatching = r.bool("usedRouteMatching");
  const isManualEntry = r.bool("isManualEntry");
  const se: string[] = [];
  const stops = normalizeStops(o.stops, se);
  se.forEach((m) => errors.push({ field: "stops", message: m }));
  if (errors.length) fail(errors);

  return {
    date, endDate: endDate ?? null,
    startAddress: str(o.startAddress) ?? "", endAddress: str(o.endAddress) ?? "",
    startLat, startLng, endLat, endLng, distance, duration,
    movingSeconds: movingSeconds ?? null, maxSpeed: maxSpeed ?? null, avgSpeed: avgSpeed ?? null,
    notes: str(o.notes) ?? null, name: str(o.name) ?? null,
    routeEncoded: str(o.routeEncoded) ?? null, matchedPolyline: str(o.matchedPolyline) ?? null,
    matchedFraction: matchedFraction ?? null, usedRouteMatching: usedRouteMatching ?? false,
    category, isFavorite: isFavorite ?? false, paidBy: str(o.paidBy) ?? "SELF",
    vehicleName: str(o.vehicleName) ?? null, vehicleMpg: vehicleMpg ?? null,
    estimatedGallons: estimatedGallons ?? null,
    scheduledDeparture: scheduledDeparture ?? null, scheduledArrival: scheduledArrival ?? null,
    journeyId: str(o.journeyId) ?? null, legIndex: legIndex ?? 0, legTotal: legTotal ?? 1,
    isManualEntry: isManualEntry ?? false, stops,
  };
}

export function parseTripPatch(raw: unknown): { id: string; data: Record<string, unknown> } {
  const o = camelKeys(unwrapPayload(raw, TRIP_KNOWN_KEYS));
  const id = str(o.id);
  if (!id) throw new ApiError(400, 'Missing "id" of the trip to update');
  const errors: FieldErr[] = [];
  const r = reader(o, errors);
  const data: Record<string, unknown> = {};
  const has = (k: string) => o[k] !== undefined;

  if (has("isFavorite")) { const b = r.bool("isFavorite"); if (b !== undefined) data.isFavorite = b; }
  if (has("category")) { const c = r.category(); if (c) data.category = c; }
  if (has("notes")) data.notes = o.notes === null ? null : typeof o.notes === "string" ? o.notes : String(o.notes);
  if (has("date")) { const d = r.date("date"); if (d) data.date = d; else if (!r.present("date")) errors.push({ field: "date", message: "cannot be empty" }); }
  if (has("paidBy")) data.paidBy = str(o.paidBy) ?? "SELF";
  if (has("stops")) { const se: string[] = []; const s = normalizeStops(o.stops, se); se.forEach((m) => errors.push({ field: "stops", message: m })); if (s) data.stops = s; }
  if (has("distance")) { const n = r.number("distance", { min: 0 }); if (n !== undefined) data.distance = n; }
  if (has("duration")) { const n = r.number("duration", { min: 0, int: true }); if (n !== undefined) data.duration = n; }
  if (has("routeEncoded")) data.routeEncoded = o.routeEncoded == null ? null : String(o.routeEncoded);
  if (has("startAddress")) data.startAddress = String(o.startAddress ?? "");
  if (has("endAddress")) data.endAddress = String(o.endAddress ?? "");
  for (const k of ["startLat", "startLng", "endLat", "endLng"]) if (has(k)) { const n = r.number(k); if (n !== undefined) data[k] = n; else if (!r.present(k)) errors.push({ field: k, message: "cannot be empty" }); }
  if (errors.length) fail(errors);
  return { id, data };
}

export function parseIdBody(raw: unknown, what: string): string {
  const o = camelKeys(unwrapPayload(raw, new Set(["id"])));
  const id = str(o.id);
  if (!id) throw new ApiError(400, `Missing "id" of the ${what}`);
  return id;
}

// ---------- error responses ----------

/** Map any thrown value to a JSON `Response`. Unknown errors become a generic 500 (and are logged). */
export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, { status: err.status });
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2025") return Response.json({ error: "Not found" }, { status: 404 });
  if (code === "P2002") return Response.json({ error: "Already exists (unique constraint)" }, { status: 409 });
  if (code === "P2003") return Response.json({ error: "Referenced record does not exist or is still in use" }, { status: 409 });
  console.error("Unhandled API error:", err);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

/** Wrap a route handler so ApiError / Prisma errors become JSON 4xx instead of a bare 500. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try { return await handler(...args); } catch (err) { return errorResponse(err); }
  };
}
