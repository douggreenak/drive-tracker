// Pure (no Prisma / Next) resolution of place names, payers and vehicles against what the app
// already knows, so an assistant never has to guess. Unit-tested with `node --test`.
// There is no geocoder in this project, so a location resolves only via a saved place, a recently
// used address, or because the caller already supplied a full street address / coordinates.

export type Place = {
  label: string;
  address: string;
  lat: number;
  lng: number;
  source: "saved_place" | "recent_trip" | "scheduled_drive";
};
export type PayerOption = { key: string; name: string; isArchived?: boolean };
export type VehicleOption = { name: string; avgMpg?: number | null };

export type Lookup = {
  places: Place[]; // saved places
  recents: Place[]; // addresses used on recent trips / scheduled drives
  payerGroups: PayerOption[];
  vehicles: VehicleOption[];
  defaultPaidBy: string;
  defaultVehicle: string | null;
  timezone: string;
};

/** A 422 whose JSON body is chosen by the thrower. `errorResponse` in api-input.ts recognises `httpBody`. */
export class UnprocessableError extends Error {
  status = 422;
  httpBody: Record<string, unknown>;
  constructor(body: { error: string } & Record<string, unknown>) {
    super(body.error);
    this.httpBody = body;
  }
}

// ---------- text helpers ----------

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const maxTypos = (len: number) => (len < 3 ? 0 : len <= 5 ? 1 : len <= 10 ? 2 : 3);

/** "123 Main St, Anchorage, AK 99501" → true. Needs street number + street + city + state. */
export function looksLikeStreetAddress(s: string): boolean {
  const t = s.trim().replace(/,?\s*(USA|US|United States( of America)?)\.?$/i, "");
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  if (!/^\d+[A-Za-z]?(-\d+)?\s+\S+/.test(parts[0])) return false; // number + street name
  const rest = parts.slice(1).join(", ");
  const state = /(?:^|[\s,])[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/.test(rest);
  const city = parts.length >= 3 ? /[A-Za-z]{2,}/.test(parts[1]) : /[A-Za-z]{2,}\s+[A-Z]{2}\b/.test(parts[1]);
  return state && city;
}

const CURRENT_LOCATION = /^(current|my|present)\s+location$|^here$|^where i am$|^my position$/i;

// ---------- locations ----------

export type LocationResult =
  | { kind: "current_location" }
  | { kind: "resolved"; address: string; lat: number; lng: number; label: string; matchedBy: Place["source"] | "exact_address" }
  | { kind: "street_address"; address: string }
  | { kind: "unresolved"; reason: "not_found" | "ambiguous" | "not_a_street_address"; suggestions: Place[] };

function namesOf(p: Place): string[] {
  const out = new Set<string>();
  out.add(norm(p.label));
  const first = p.address.split(",")[0]?.trim() ?? "";
  if (first && !/^\d/.test(first)) out.add(norm(first)); // "Fred Meyer, 1000 ..." → "fred meyer"
  return [...out].filter(Boolean);
}

function tierOf(nq: string, p: Place): number {
  let best = 99;
  for (const n of namesOf(p)) {
    if (n === nq) return 0;
    if (` ${n} `.includes(` ${nq} `)) best = Math.min(best, 1);
    else if (Math.abs(n.length - nq.length) <= 3 && levenshtein(n, nq) <= maxTypos(nq.length)) best = Math.min(best, 2);
  }
  return best;
}

function dedupe(ps: Place[]): Place[] {
  const seen = new Set<string>();
  return ps.filter((p) => {
    const k = norm(p.address);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function suggestionsFor(nq: string, lookup: Pick<Lookup, "places" | "recents">): Place[] {
  const scored = [...lookup.places, ...lookup.recents]
    .map((p) => ({ p, d: Math.min(...namesOf(p).map((n) => levenshtein(n, nq))) }))
    .sort((a, b) => a.d - b.d);
  // all saved places first (they're the user's own names), then the closest recents
  return dedupe([...lookup.places, ...scored.map((s) => s.p).filter((p) => p.source !== "saved_place")]).slice(0, 8);
}

export function resolveLocation(input: string, lookup: Pick<Lookup, "places" | "recents">): LocationResult {
  const q = input.trim();
  if (CURRENT_LOCATION.test(q)) return { kind: "current_location" };
  const nq = norm(q);
  const all = [...lookup.places, ...lookup.recents];

  // The exact stored address — reuse its coordinates.
  const exact = all.find((p) => norm(p.address) === nq && nq);
  if (exact) return { kind: "resolved", address: exact.address, lat: exact.lat, lng: exact.lng, label: exact.label, matchedBy: "exact_address" };

  if (looksLikeStreetAddress(q)) return { kind: "street_address", address: q };

  if (nq) {
    let best = 99;
    const tiers = all.map((p) => { const t = tierOf(nq, p); best = Math.min(best, t); return t; });
    if (best < 99) {
      let hits = all.filter((_, i) => tiers[i] === best);
      const saved = hits.filter((p) => p.source === "saved_place");
      if (saved.length) hits = saved; // the user's own saved names beat history
      hits = dedupe(hits);
      if (hits.length === 1) {
        const h = hits[0];
        return { kind: "resolved", address: h.address, lat: h.lat, lng: h.lng, label: h.label, matchedBy: h.source };
      }
      return { kind: "unresolved", reason: "ambiguous", suggestions: hits.slice(0, 8) };
    }
  }
  return {
    kind: "unresolved",
    reason: /\d/.test(q) ? "not_a_street_address" : "not_found",
    suggestions: suggestionsFor(nq, lookup),
  };
}

// ---------- payer ----------

const PAYER_ALIASES: Array<[RegExp, string]> = [
  [/^(parents?|my parents?|mom and dad|mom n dad|mom dad|mom|dad|mother|father|folks)$/, "PARENTS"],
  [/^(me|self|myself|mine|my own|i|own)$/, "SELF"],
];

export function resolvePayer(input: string | undefined, lookup: Pick<Lookup, "payerGroups" | "defaultPaidBy">): { key: string; label: string } {
  const active = lookup.payerGroups.filter((g) => !g.isArchived);
  const options = active.length ? active : [{ key: "SELF", name: "Me" }, { key: "PARENTS", name: "Parents" }];
  const labelOf = (key: string) => options.find((g) => g.key === key)?.name ?? lookup.payerGroups.find((g) => g.key === key)?.name ?? key;

  const raw = (input ?? "").trim();
  if (!raw) return { key: lookup.defaultPaidBy, label: labelOf(lookup.defaultPaidBy) };

  const n = norm(raw);
  const byKey = options.find((g) => g.key.toLowerCase() === raw.toLowerCase());
  const byName = options.find((g) => norm(g.name) === n);
  let found = byKey ?? byName;
  if (!found) {
    for (const [re, key] of PAYER_ALIASES) {
      if (re.test(n)) found = options.find((g) => g.key === key);
    }
  }
  if (!found) {
    // small typos / partial ("parent", "parnts")
    const close = options.filter((g) => [g.key.toLowerCase(), norm(g.name)].some((c) => levenshtein(c, n) <= maxTypos(n.length)));
    if (close.length === 1) found = close[0];
  }
  if (found) return { key: found.key, label: found.name };
  throw new UnprocessableError({
    error: `Unknown payer "${raw}"`,
    field: "paidBy",
    valid: options.map((g) => ({ key: g.key, label: g.name })),
    hint: "Use one of the valid payer keys or labels (aliases such as \"parents\", \"mom and dad\", \"me\" also work).",
  });
}

// ---------- vehicle ----------

export function resolveVehicle(input: string | undefined, lookup: Pick<Lookup, "vehicles" | "defaultVehicle">): VehicleOption | null {
  const raw = (input ?? "").trim();
  if (!raw) return lookup.defaultVehicle ? lookup.vehicles.find((v) => v.name === lookup.defaultVehicle) ?? null : null;
  const n = norm(raw);
  const tiers: Array<(v: VehicleOption) => boolean> = [
    (v) => norm(v.name) === n,
    (v) => ` ${norm(v.name)} `.includes(` ${n} `), // "van" → "Family Van"
    (v) => n.length >= 3 && ` ${n} `.includes(` ${norm(v.name)} `) && norm(v.name).length >= 3,
    (v) => levenshtein(norm(v.name), n) <= maxTypos(n.length),
  ];
  for (const t of tiers) {
    const hits = lookup.vehicles.filter(t);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      throw new UnprocessableError({
        error: `Vehicle "${raw}" matches more than one vehicle`,
        field: "vehicleName",
        valid: lookup.vehicles.map((v) => v.name),
        hint: "Use the full vehicle name.",
      });
    }
  }
  throw new UnprocessableError({
    error: `Unknown vehicle "${raw}"`,
    field: "vehicleName",
    valid: lookup.vehicles.map((v) => v.name),
    hint: lookup.vehicles.length ? "Use one of the valid vehicle names." : "No vehicles are configured; omit the vehicle.",
  });
}

// ---------- a whole record's locations ----------

export type LocInput = {
  field: string; // "start" | "end" | "stops[0]"
  address: string;
  lat: number;
  lng: number;
};
export type ResolvedLoc = {
  field: string;
  input: string;
  address: string;
  lat: number;
  lng: number;
  label: string | null;
  matchedBy: "saved_place" | "recent_trip" | "scheduled_drive" | "exact_address" | "street_address" | "coordinates" | "current_location";
};

/**
 * Resolve every location of a record. Locations that already carry coordinates are trusted as-is
 * (that's what the iOS app sends). Anything that can't be resolved is collected and thrown as ONE 422.
 */
export function resolveLocations(locs: LocInput[], lookup: Pick<Lookup, "places" | "recents">): ResolvedLoc[] {
  const out: ResolvedLoc[] = [];
  const bad: Array<{ field: string; name: string; reason: string }> = [];
  const suggestions: Place[] = [];

  for (const l of locs) {
    const hasCoords = Boolean(l.lat) || Boolean(l.lng);
    const name = l.address.trim();
    if (!name && !hasCoords) { bad.push({ field: l.field, name: "", reason: "missing" }); continue; }
    if (hasCoords) {
      out.push({ field: l.field, input: name, address: name, lat: l.lat, lng: l.lng, label: null, matchedBy: "coordinates" });
      continue;
    }
    const r = resolveLocation(name, lookup);
    if (r.kind === "current_location") out.push({ field: l.field, input: name, address: "Current location", lat: 0, lng: 0, label: null, matchedBy: "current_location" });
    else if (r.kind === "street_address") out.push({ field: l.field, input: name, address: r.address, lat: 0, lng: 0, label: null, matchedBy: "street_address" });
    else if (r.kind === "resolved") out.push({ field: l.field, input: name, address: r.address, lat: r.lat, lng: r.lng, label: r.label, matchedBy: r.matchedBy === "exact_address" ? "exact_address" : r.matchedBy });
    else { bad.push({ field: l.field, name, reason: r.reason }); suggestions.push(...r.suggestions); }
  }

  if (bad.length) {
    const names = bad.map((b) => b.name).filter(Boolean);
    const ambiguous = bad.some((b) => b.reason === "ambiguous");
    throw new UnprocessableError({
      error: names.length
        ? `Could not resolve ${names.map((n) => `"${n}"`).join(", ")} to a real street address`
        : `Missing location: ${bad.map((b) => b.field).join(", ")}`,
      field: bad[0].field,
      unresolved: names,
      hint: ambiguous
        ? "More than one saved place or recent address matches. Ask the user which one, or send the full street address."
        : "Ask the user for the full street address (number, street, city, state) or the name of a saved place, then retry.",
      suggestions: dedupe(suggestions).slice(0, 10).map((p) => ({ label: p.label, address: p.address, lat: p.lat, lng: p.lng, source: p.source })),
      details: bad.map((b) => ({ field: b.field, input: b.name, reason: b.reason })),
    });
  }
  return out;
}

// ---------- plain-language confirmation ----------

export function formatLocal(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(d);
}
