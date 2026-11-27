// Looks up a business or street ("Costco") near the user's saved places. There is no geocoder in the
// app otherwise, so names that match nothing saved used to be refused. Uses OpenStreetMap's public
// Nominatim search (free; light personal use is within its policy: identify the app, one request at a time).
import type { LocInput, Lookup } from "./resolve.ts";

export type Geo = { address: string; lat: number; lng: number; label: string };
export type Geocoder = (name: string, near: { lat: number; lng: number }) => Promise<Geo | null>;

const STATE_ABBR = (code?: string) => (code && /^US-[A-Z]{2}$/.test(code) ? code.slice(3) : undefined);

type NominatimHit = { lat: string; lon: string; name?: string; display_name?: string; address?: Record<string, string> };

export function formatHit(h: NominatimHit): Geo {
  const a = h.address ?? {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.hamlet || a.county;
  const st = STATE_ABBR(a["ISO3166-2-lvl4"]) ?? a.state;
  const name = h.name && h.name !== a.road ? h.name : "";
  const parts = [name, street, city, [st, a.postcode].filter(Boolean).join(" ")].filter(Boolean);
  return { address: parts.length >= 3 ? parts.join(", ") : h.display_name ?? parts.join(", "), lat: Number(h.lat), lng: Number(h.lon), label: name || street };
}

/** Where to search: around "Home" if it is saved, else the first saved place with coordinates. */
export function searchCenter(places: Lookup["places"]): { lat: number; lng: number } | null {
  const withCoords = places.filter((p) => p.lat || p.lng);
  const home = withCoords.find((p) => /^home$/i.test(p.label.trim())) ?? withCoords[0];
  return home ? { lat: home.lat, lng: home.lng } : null;
}

export const nominatim: Geocoder = async (name, near) => {
  const d = 0.35; // about 25 miles each way: "Costco" means the one in your town
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.search = new URLSearchParams({ q: name, format: "jsonv2", limit: "1", addressdetails: "1",
    viewbox: `${near.lng - d * 2},${near.lat + d},${near.lng + d * 2},${near.lat - d}`, bounded: "1" }).toString();
  try {
    const r = await fetch(u, { headers: { "user-agent": "drive-tracker/1.0 (personal app)", accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const hits = (await r.json()) as NominatimHit[];
    return hits[0] && Number.isFinite(Number(hits[0].lat)) ? formatHit(hits[0]) : null;
  } catch { return null; }
};

/** The locations that failed only because nothing saved matched: ask the geocoder, keep the coordinates it finds. */
export async function fillFromGeocoder(locs: LocInput[], names: Set<string>, near: { lat: number; lng: number } | null, geocoder: Geocoder = nominatim): Promise<LocInput[]> {
  if (!near) return locs;
  return Promise.all(locs.map(async (l) => {
    if (!names.has(l.field)) return l;
    const g = await geocoder(l.address.trim(), near);
    return g ? { ...l, address: g.address, lat: g.lat, lng: g.lng } : l;
  }));
}
