import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError, SCHEDULED_KNOWN_KEYS, normalizeStops, parseScheduledCreate, parseScheduledPatch,
  parseTimeOfDay, parseTripCreate, parseTripPatch, readBody, unwrapPayload,
} from "../src/lib/api-input.ts";

const inner = { date: "2026-11-26", departure_time: "11:18", start: "Current location", stops: ["Fred Meyer"], end: "Home", notes: "Round trip to Fred Meyer then home" };

test("connector payload: wrapped + stringified object parses", () => {
  const d = parseScheduledCreate({ scheduled: JSON.stringify(inner) });
  assert.equal(d.departure.toISOString(), "2026-11-26T11:18:00.000Z");
  assert.equal(d.endAddress, "Home");
  assert.deepEqual(d.stops, [{ address: "Fred Meyer", lat: 0, lng: 0 }]);
  assert.equal(d.startAddress, "Current location");
  assert.equal(d.notes, "Round trip to Fred Meyer then home");
  assert.equal(d.repeatRule, "NONE");
});

test("all body shapes yield the same result", () => {
  const a = parseScheduledCreate(inner);
  for (const shape of [JSON.stringify(inner), { scheduled: inner }, { data: JSON.stringify(inner) }, JSON.stringify({ scheduled: inner })]) {
    assert.deepEqual(parseScheduledCreate(shape), a);
  }
});

test("native documented shape still works", () => {
  const d = parseScheduledCreate({ title: "Commute", startAddress: "A", endAddress: "B", departure: "2026-11-26T11:18:00Z", estimatedTravelTime: 600, repeatRule: "WEEKDAYS", category: "WORK" });
  assert.equal(d.title, "Commute");
  assert.equal(d.scheduledArrival.toISOString(), "2026-11-26T11:28:00.000Z");
  assert.equal(d.repeatRule, "WEEKDAYS");
});

test("time formats", () => {
  assert.deepEqual(parseTimeOfDay("11:18"), { h: 11, m: 18, s: 0 });
  assert.deepEqual(parseTimeOfDay("11:18 AM"), { h: 11, m: 18, s: 0 });
  assert.deepEqual(parseTimeOfDay("11:18pm"), { h: 23, m: 18, s: 0 });
  assert.deepEqual(parseTimeOfDay("12:05 AM"), { h: 0, m: 5, s: 0 });
  assert.deepEqual(parseTimeOfDay("7 p.m."), { h: 19, m: 0, s: 0 });
  assert.deepEqual(parseTimeOfDay("23:05:09"), { h: 23, m: 5, s: 9 });
  for (const bad of ["25:00", "13:00 PM", "noon", "11", "", 5]) assert.equal(parseTimeOfDay(bad), undefined);
});

test("time zone applied to wall-clock times", () => {
  const d = parseScheduledCreate({ ...inner, timezone: "America/Anchorage" });
  assert.equal(d.departure.toISOString(), "2026-11-26T20:18:00.000Z"); // AKST = UTC-9
  const e = parseScheduledCreate(inner, { defaultTimeZone: "America/Anchorage" });
  assert.equal(e.departure.toISOString(), "2026-11-26T20:18:00.000Z");
});

test("stops variations", () => {
  assert.deepEqual(normalizeStops("Fred Meyer"), [{ address: "Fred Meyer", lat: 0, lng: 0 }]);
  assert.equal(normalizeStops("Fred Meyer; Costco\nHome Depot")!.length, 3);
  assert.equal(normalizeStops("123 Main St, Anchorage")!.length, 1);
  assert.deepEqual(normalizeStops([{ name: "X", latitude: 1, longitude: 2 }]), [{ address: "X", lat: 1, lng: 2 }]);
  assert.equal(normalizeStops(undefined), undefined);
  const errs: string[] = [];
  normalizeStops([42, {}], errs);
  assert.equal(errs.length, 1 + 1);
});

test("optional fields missing: only departure + destination are needed", () => {
  const d = parseScheduledCreate({ date: "2026-11-26", time: "7:30 am", stops: "Costco" });
  assert.equal(d.endAddress, "Costco");
  assert.equal(d.title, "Drive to Costco");
  assert.equal(d.category, "COMMUTE");
});

test("validation errors are 422 with field details", () => {
  assert.throws(() => parseScheduledCreate({ end: "Home" }), (e) => e instanceof ApiError && e.status === 422 && e.details![0].field === "departure");
  assert.throws(() => parseScheduledCreate({ date: "2026-13-45", departure_time: "11:18", end: "H" }), /real calendar date/);
  assert.throws(() => parseScheduledCreate({ date: "2026-11-26", departure_time: "banana", end: "H" }), /departure_time/);
  assert.throws(() => parseScheduledCreate({ date: "2026-11-26", departure_time: "1:00", end: "H", category: "NOPE", repeat: "SOMETIMES" }), (e) => e instanceof ApiError && e.details!.length === 2);
  assert.throws(() => parseScheduledCreate({ date: "2026-11-26", departure_time: "1:00", end: "H", timezone: "Mars/Base" }), /time zone/);
  assert.throws(() => parseScheduledCreate({ date: "2026-11-26", departure_time: "1:00" }), /end/);
});

test("non-object bodies are 400", () => {
  for (const bad of [null, 5, [1], "not json", "[1,2]", true]) {
    assert.throws(() => unwrapPayload(bad, SCHEDULED_KNOWN_KEYS), (e) => e instanceof ApiError && e.status === 400);
  }
});

test("readBody: empty / invalid JSON → 400", async () => {
  const mk = (b: string) => new Request("http://x", { method: "POST", body: b });
  await assert.rejects(readBody(mk(""), SCHEDULED_KNOWN_KEYS), (e) => e instanceof ApiError && e.status === 400);
  await assert.rejects(readBody(mk("{oops"), SCHEDULED_KNOWN_KEYS), /not valid JSON/);
  assert.deepEqual(await readBody(mk(JSON.stringify({ scheduled: JSON.stringify({ a: 1 }) })), SCHEDULED_KNOWN_KEYS), { a: 1 });
});

test("scheduled PATCH is partial and validated", () => {
  const { id, data } = parseScheduledPatch({ id: "abc", isCanceled: true });
  assert.equal(id, "abc");
  assert.deepEqual(data, { isCanceled: true });
  assert.throws(() => parseScheduledPatch({ isCanceled: true }), /id/);
  assert.throws(() => parseScheduledPatch({ id: "a", departure: "garbage" }), (e) => e instanceof ApiError && e.status === 422);
});

test("trip create / patch", () => {
  const t = parseTripCreate({ trip: JSON.stringify({ startAddress: "A", endAddress: "B", distance: "12.5", duration: 900, category: "errand", stops: "Costco" }) });
  assert.equal(t.distance, 12.5);
  assert.equal(t.category, "ERRAND");
  assert.equal(t.paidBy, "SELF");
  assert.ok(t.date instanceof Date);
  assert.throws(() => parseTripCreate({ startAddress: "A" }), (e) => e instanceof ApiError && e.details!.length === 2);
  assert.throws(() => parseTripCreate({ distance: 1, duration: 1, date: "nope", category: "X" }), (e) => e instanceof ApiError && e.details!.length === 2);
  assert.deepEqual(parseTripPatch({ id: "t1", isFavorite: "true" }).data, { isFavorite: true });
  assert.throws(() => parseTripPatch({ isFavorite: true }), /id/);
  assert.throws(() => parseTripPatch({ id: "t", date: "bad" }), (e) => e instanceof ApiError && e.status === 422);
});
