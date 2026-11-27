import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLocation, resolveLocations, type Lookup, type Place } from "../src/lib/resolve.ts";
import { fillFromGeocoder, formatHit, searchCenter } from "../src/lib/geocode.ts";

const place = (label: string, address: string, lat: number, lng: number): Place => ({ label, address, lat, lng, source: "saved_place" });
const lookup: Pick<Lookup, "places" | "recents"> = {
  places: [place("Home", "3624 Mink Ln, Fairbanks, AK, United States", 64.893, -147.279), place("Work", "3534 Industrial Ave, Fairbanks", 64.8133, -147.7565)],
  recents: [],
};

test("a pinned saved place without a state in its text still resolves (Work)", () => {
  const r = resolveLocation("Work", lookup);
  assert.equal(r.kind, "resolved");
  if (r.kind === "resolved") { assert.equal(r.address, "3534 Industrial Ave, Fairbanks"); assert.equal(r.lat, 64.8133); }
});

test("a saved place with no coordinates and no street is still refused", () => {
  const r = resolveLocation("Shop", { places: [place("Shop", "Shop", 0, 0)], recents: [] });
  assert.equal(r.kind, "unresolved");
});

test("search is centred on Home", () => {
  assert.deepEqual(searchCenter(lookup.places), { lat: 64.893, lng: -147.279 });
  assert.equal(searchCenter([]), null);
});

test("an unknown business is looked up and keeps the coordinates found", async () => {
  const locs = [{ field: "start", address: "Work", lat: 0, lng: 0 }, { field: "end", address: "Costco", lat: 0, lng: 0 }];
  assert.throws(() => resolveLocations(locs, lookup)); // nothing saved called Costco
  const seen: string[] = [];
  const filled = await fillFromGeocoder(locs, new Set(["end"]), searchCenter(lookup.places), async (name) => { seen.push(name); return { address: "Costco Wholesale, 4 Example Rd, Fairbanks, AK 99701", lat: 64.85, lng: -147.7, label: "Costco Wholesale" }; });
  assert.deepEqual(seen, ["Costco"]); // Work was not sent to the map
  const out = resolveLocations(filled, lookup);
  assert.equal(out[0].address, "3534 Industrial Ave, Fairbanks");
  assert.equal(out[1].lat, 64.85); assert.equal(out[1].matchedBy, "coordinates");
});

test("if the map finds nothing the original refusal stays", async () => {
  const locs = [{ field: "end", address: "Zzzz Nowhere", lat: 0, lng: 0 }];
  const filled = await fillFromGeocoder(locs, new Set(["end"]), searchCenter(lookup.places), async () => null);
  assert.equal(filled[0], locs[0]);
});

test("map results are written as a street address with a two-letter state", () => {
  const g = formatHit({ lat: "64.85", lon: "-147.7", name: "Costco Wholesale", address: { house_number: "4", road: "Example Rd", city: "Fairbanks", "ISO3166-2-lvl4": "US-AK", postcode: "99701" } });
  assert.equal(g.address, "Costco Wholesale, 4 Example Rd, Fairbanks, AK 99701");
});
