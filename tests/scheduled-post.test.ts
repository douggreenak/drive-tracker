import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma, resetDb } from "./support/fake-db.ts";
import { createScheduledDrive, resolveNames, upcomingWhere } from "../src/lib/context.ts";
import { startOfLocalDay } from "../src/lib/api-input.ts";

const HOME = "3624 Mink Ln, Fairbanks, AK 99709";
const FM = "Fred Meyer, 3627 Airport Way, Fairbanks, AK 99709";

async function seed({ homeAddress = HOME }: { homeAddress?: string } = {}) {
  delete process.env.APP_TIMEZONE;
  await prisma.savedPlace.create({ data: { label: "Home", address: homeAddress, lat: 64.84, lng: -147.72 } });
  // The iOS app also records trips whose address is just the saved-place name:
  await prisma.trip.create({ data: { startAddress: "Home", startLat: 64.84, startLng: -147.72, endAddress: FM, endLat: 64.83, endLng: -147.8, stops: null, vehicleName: null } });
  await prisma.trip.create({ data: { startAddress: FM, startLat: 64.83, startLng: -147.8, endAddress: "Home", endLat: 64.84, endLng: -147.72, stops: null, vehicleName: null } });
}
beforeEach(() => resetDb());

// The exact body the connector sent when the owner's drive "disappeared".
const REPORTED = { scheduled: "{\"date\":\"2026-11-26\",\"time\":\"11:30\",\"stops\":[\"Fred Meyer\",\"Home\"],\"notes\":\"Drive to Fred Meyer then home\"}" };

test("regression: reported request is saved, readable back, and fully resolved", async () => {
  await seed();
  const r = await createScheduledDrive(REPORTED);

  // a 2xx-worthy result means a stored record with an id
  assert.ok(r.id);
  assert.equal(r.created, true);
  assert.equal(prisma.scheduledDrive.rows.length, 1);
  assert.equal((await prisma.scheduledDrive.findUnique({ where: { id: r.id } }))?.id, r.id);

  // "time" is an alias of departure_time, read in the owner's zone (AKST = UTC-9), not UTC
  assert.equal(r.departure.toISOString(), "2026-11-26T20:30:00.000Z");
  assert.match(r.departureLocal, /November 26, 2026 at 11:30 AM AKST/);
  assert.equal(r.timezone, "America/Anchorage");

  // missing start → saved Home (real address); end defaults to last stop; Home is the REAL address
  assert.equal(r.startAddress, HOME);
  assert.equal(r.endAddress, HOME);
  assert.deepEqual(r.stops!.map((s) => (s as { address: string }).address), [FM, HOME]);
  assert.ok(r.defaultsApplied.includes("start → Home"));
  assert.equal(r.title, "Drive to Fred Meyer, then Home");
  assert.equal(r.isEnabled, true);
  assert.equal(r.isCanceled, false);
  assert.equal(r.paidBy, "SELF");
  assert.equal(r.paidByLabel, "Me");
  assert.ok(r.resolvedLocations.every((l) => l.address !== "Home"));
  assert.match(r.summary, /Fred Meyer/);
});

test("without a real Home address the start falls back to Current location", async () => {
  await seed({ homeAddress: "Home" });
  await assert.rejects(createScheduledDrive(REPORTED), (e) => {
    // Home has no real address → 422 asking for it (not a silent "Home" address)
    const b = (e as { httpBody?: Record<string, unknown> }).httpBody!;
    assert.equal((e as { status: number }).status, 422);
    assert.deepEqual(b.unresolved, ["Home", "Home"]);
    assert.match(String(b.hint), /no real street address/);
    return true;
  });
  assert.equal(prisma.scheduledDrive.rows.length, 0); // nothing half-created
});

test("failures never create a record", async () => {
  await seed();
  await assert.rejects(createScheduledDrive({ scheduled: "{\"date\":\"2026-11-26\",\"time\":\"11:30\",\"stops\":[\"Trader Joe's\"]}" }));
  await assert.rejects(createScheduledDrive({ scheduled: "{\"time\":\"11:30\",\"stops\":[\"Home\"]}" }));
  assert.equal(prisma.scheduledDrive.rows.length, 0);
});

test("a drive scheduled later today/tomorrow is reported as appearing in upcoming", async () => {
  await seed();
  const tomorrow = new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);
  const r = await createScheduledDrive({ date: tomorrow, departure_time: "7:15 AM", end: "Home" });
  assert.equal(r.appearsInUpcoming, true);
  assert.equal(r.startAddress, HOME);
});

test("upcoming cut-off is the start of the local day, not 'now - 1h'", () => {
  const noonAkst = new Date("2026-11-26T21:00:00Z"); // 12:00 AKST
  assert.equal(startOfLocalDay("America/Anchorage", noonAkst).toISOString(), "2026-11-26T09:00:00.000Z");
  assert.equal(upcomingWhere("America/Anchorage").isEnabled, true);
});

test("GET /api/resolve?q=Home resolves to the real street address", async () => {
  await seed();
  const [home, fm, nope] = await resolveNames(["Home", "fred meyer", "Trader Joe's"]);
  assert.equal(home.ok, true);
  if (home.ok) { assert.equal(home.address, HOME); assert.equal(home.matchedBy, "saved_place"); }
  assert.equal(fm.ok, true);
  if (fm.ok) assert.equal(fm.address, FM);
  assert.equal(nope.ok, false);
});

test("saved place whose stored address is only its name → ok:false with a hint", async () => {
  await seed({ homeAddress: "Home" });
  await prisma.savedPlace.create({ data: { label: "Cabin", address: "Cabin", lat: 0, lng: 0 } });
  const [home, cabin] = await resolveNames(["Home", "Cabin"]);
  for (const r of [home, cabin]) {
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(String(r.hint), /street address/);
  }
});
