// Estimated driving time for a scheduled drive when the caller gave none (otherwise arrival == departure).
// Uses OpenStreetMap's public OSRM router (free, fair use). Returns null if anything is unknown; callers then keep what they had.
import { nominatim, searchCenter, type Geocoder } from "./geocode.ts";
import type { Lookup, ResolvedLoc } from "./resolve.ts";

export type Router = (points: { lat: number; lng: number }[]) => Promise<number | null>;

export const osrm: Router = async (points) => {
  if (points.length < 2) return null;
  const path = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=false`, { headers: { "user-agent": "drive-tracker/1.0 (personal app)" }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { code?: string; routes?: { duration?: number }[] };
    const d = j.routes?.[0]?.duration;
    return j.code === "Ok" && typeof d === "number" && d > 0 ? d : null;
  } catch { return null; }
};

/** Seconds to drive start → stops → end, or null when a place has no known position (e.g. "Current location"). */
export async function estimateTravelSeconds(resolved: ResolvedLoc[], places: Lookup["places"], router: Router = osrm, geocoder: Geocoder = nominatim): Promise<number | null> {
  const near = searchCenter(places);
  const pts: { lat: number; lng: number }[] = [];
  for (const r of resolved) {
    if (r.matchedBy === "current_location") return null;
    if (r.lat || r.lng) { pts.push({ lat: r.lat, lng: r.lng }); continue; }
    const g = near ? await geocoder(r.address, near) : null;   // a typed-out street address has no coordinates yet
    if (!g) return null;
    pts.push({ lat: g.lat, lng: g.lng });
  }
  const s = await router(pts);
  return s === null ? null : Math.max(60, Math.round(s));
}
