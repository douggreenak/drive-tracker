import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UnprocessableError, formatLocal, levenshtein, looksLikeStreetAddress, resolveLocation, resolveLocations,
  resolvePayer, resolveVehicle, type Lookup, type Place,
} from "../src/lib/resolve.ts";

const place = (label: string, address: string, source: Place["source"] = "saved_place", lat = 61.2, lng = -149.9): Place => ({ label, address, lat, lng, source });
const home = place("Home", "100 Spruce St, Anchorage, AK 99501");
const lookup: Lookup = {
  places: [home, place("Work", "200 Fireweed Ln, Anchorage, AK 99503")],
  recents: [
    place("Fred Meyer", "Fred Meyer, 1000 Muldoon Rd, Anchorage, AK 99504", "recent_trip", 61.21, -149.74),
    place("Costco", "Costco, 1000 E Dowling Rd, Anchorage, AK 99518", "recent_trip"),
    place("Costco", "Costco, 800 W Tudor Rd, Anchorage, AK 99503", "recent_trip"),
  ],
  payerGroups: [{ key: "SELF", name: "Me" }, { key: "PARENTS", name: "Parents" }, { key: "OLD", name: "Old", isArchived: true }],
  vehicles: [{ name: "Family Van", avgMpg: 18 }, { name: "Civic", avgMpg: 34 }],
  defaultPaidBy: "SELF", defaultVehicle: "Civic", timezone: "America/Anchorage",
};

test("street address detection", () => {
  assert.equal(looksLikeStreetAddress("123 Main St, Anchorage, AK 99501"), true);
  assert.equal(looksLikeStreetAddress("123 Main St, Anchorage AK"), true);
  assert.equal(looksLikeStreetAddress("123 Main St, Anchorage, AK, USA"), true);
  for (const bad of ["Fred Meyer", "123 Main St", "Main St, Anchorage, AK", "Home", "123 Main St, Anchorage"]) {
    assert.equal(looksLikeStreetAddress(bad), false, bad);
  }
});

test("saved place resolves case-insensitively and fills address + coords", () => {
  const r = resolveLocation("hOmE", lookup);
  assert.equal(r.kind, "resolved");
  if (r.kind === "resolved") { assert.equal(r.address, home.address); assert.equal(r.lat, 61.2); assert.equal(r.matchedBy, "saved_place"); }
});

test("typos resolve", () => {
  const r = resolveLocation("Fred Meyr", lookup);
  assert.equal(r.kind, "resolved");
  if (r.kind === "resolved") assert.match(r.address, /Muldoon/);
  assert.equal(resolveLocation("Wk", lookup).kind, "unresolved"); // too short to guess
  assert.equal(resolveLocation("Wrk", lookup).kind, "resolved");
  assert.equal(resolveLocation("wark", lookup).kind, "resolved");
});

test("recent trip name resolves; ambiguous recents do not", () => {
  const r = resolveLocation("fred meyer", lookup);
  assert.equal(r.kind, "resolved");
  if (r.kind === "resolved") assert.equal(r.matchedBy, "recent_trip");
  const c = resolveLocation("Costco", lookup);
  assert.equal(c.kind, "unresolved");
  if (c.kind === "unresolved") { assert.equal(c.reason, "ambiguous"); assert.equal(c.suggestions.length, 2); }
});

test("full street address passes through; current location is allowed", () => {
  assert.equal(resolveLocation("55 Elm Ave, Wasilla, AK 99654", lookup).kind, "street_address");
  assert.equal(resolveLocation("Current location", lookup).kind, "current_location");
  const exact = resolveLocation("100 spruce st anchorage ak 99501", lookup);
  assert.equal(exact.kind, "resolved");
});

test("unknown name → unresolved with saved-place suggestions", () => {
  const r = resolveLocation("Trader Joe's", lookup);
  assert.equal(r.kind, "unresolved");
  if (r.kind === "unresolved") assert.ok(r.suggestions.some((s) => s.label === "Home"));
});

test("resolveLocations: 422 body shape", () => {
  assert.throws(
    () => resolveLocations([
      { field: "start", address: "Home", lat: 0, lng: 0 },
      { field: "stops[0]", address: "Trader Joe's", lat: 0, lng: 0 },
      { field: "end", address: "Home", lat: 0, lng: 0 },
    ], lookup),
    (e) => {
      assert.ok(e instanceof UnprocessableError);
      const b = e.httpBody as Record<string, unknown>;
      assert.equal(e.status, 422);
      assert.equal(b.field, "stops[0]");
      assert.deepEqual(b.unresolved, ["Trader Joe's"]);
      assert.equal(typeof b.hint, "string");
      assert.equal(typeof b.error, "string");
      assert.ok(Array.isArray(b.suggestions) && b.suggestions.length > 0);
      return true;
    },
  );
});

test("locations that already carry coordinates are trusted (iOS sync)", () => {
  const [r] = resolveLocations([{ field: "start", address: "Muldoon Rd", lat: 61.1, lng: -149.7 }], lookup);
  assert.equal(r.matchedBy, "coordinates");
  assert.throws(() => resolveLocations([{ field: "end", address: "", lat: 0, lng: 0 }], lookup), UnprocessableError);
});

test("payer defaults and aliases", () => {
  assert.deepEqual(resolvePayer(undefined, lookup), { key: "SELF", label: "Me" });
  assert.deepEqual(resolvePayer(undefined, { ...lookup, defaultPaidBy: "PARENTS" }), { key: "PARENTS", label: "Parents" });
  for (const a of ["Parents", "parent", "mom and dad", "Mom & Dad", "PARENTS", "parnts"]) assert.equal(resolvePayer(a, lookup).key, "PARENTS", a);
  for (const a of ["me", "Self", "SELF", "Me"]) assert.equal(resolvePayer(a, lookup).key, "SELF", a);
  assert.throws(() => resolvePayer("the neighbors", lookup), (e) => {
    assert.ok(e instanceof UnprocessableError);
    const b = e.httpBody as { field: string; valid: Array<{ key: string }> };
    assert.equal(b.field, "paidBy");
    assert.deepEqual(b.valid.map((v) => v.key), ["SELF", "PARENTS"]); // archived excluded
    return true;
  });
  // no payer groups seeded: built-ins still work
  assert.equal(resolvePayer("parents", { payerGroups: [], defaultPaidBy: "SELF" }).key, "PARENTS");
});

test("vehicle defaults, partial/case-insensitive match, 422", () => {
  assert.equal(resolveVehicle(undefined, lookup)?.name, "Civic");
  assert.equal(resolveVehicle(undefined, { ...lookup, defaultVehicle: null }), null);
  assert.equal(resolveVehicle("van", lookup)?.name, "Family Van");
  assert.equal(resolveVehicle("FAMILY VAN", lookup)?.name, "Family Van");
  assert.equal(resolveVehicle("civik", lookup)?.name, "Civic");
  assert.throws(() => resolveVehicle("truck", lookup), (e) => {
    assert.ok(e instanceof UnprocessableError);
    const b = e.httpBody as { field: string; valid: string[] };
    assert.equal(b.field, "vehicleName");
    assert.deepEqual(b.valid, ["Family Van", "Civic"]);
    return true;
  });
});

test("misc", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.match(formatLocal(new Date("2026-11-26T20:18:00Z"), "America/Anchorage"), /Thursday, November 26, 2026.*11:18 AM/);
});
