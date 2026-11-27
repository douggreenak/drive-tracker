import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateTravelSeconds } from "../src/lib/route.ts";
import type { Place, ResolvedLoc } from "../src/lib/resolve.ts";

const home: Place = { label: "Home", address: "1 A St, Fairbanks, AK", lat: 64.89, lng: -147.28, source: "saved_place" };
const loc = (field: string, lat: number, lng: number, matchedBy: ResolvedLoc["matchedBy"] = "saved_place"): ResolvedLoc => ({ field, input: field, address: field + " St, Fairbanks, AK", lat, lng, label: null, matchedBy });

test("travel time comes from the router over start, stops and end in order", async () => {
  let got: { lat: number; lng: number }[] = [];
  const s = await estimateTravelSeconds([loc("start", 1, 2), loc("stops[0]", 3, 4), loc("end", 5, 6)], [home], async (p) => { got = p; return 754.2; });
  assert.equal(s, 754); assert.deepEqual(got, [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { lat: 5, lng: 6 }]);
});
test("a very short hop is at least a minute", async () => {
  assert.equal(await estimateTravelSeconds([loc("a", 1, 2), loc("b", 1, 2)], [home], async () => 5), 60);
});
test("a typed street address with no coordinates is looked up first", async () => {
  const s = await estimateTravelSeconds([loc("start", 1, 2), loc("end", 0, 0, "street_address")], [home], async (p) => (p[1].lat === 9 ? 600 : null), async () => ({ address: "x", lat: 9, lng: 9, label: "x" }));
  assert.equal(s, 600);
});
test("no estimate (null) for Current location, unknown places or a router that fails", async () => {
  assert.equal(await estimateTravelSeconds([loc("start", 0, 0, "current_location"), loc("end", 1, 2)], [home], async () => 600), null);
  assert.equal(await estimateTravelSeconds([loc("start", 1, 2), loc("end", 0, 0, "street_address")], [home], async () => 600, async () => null), null);
  assert.equal(await estimateTravelSeconds([loc("start", 1, 2), loc("end", 3, 4)], [home], async () => null), null);
});
