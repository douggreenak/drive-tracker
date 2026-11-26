// OpenAPI 3.1 description of the REST API. Authenticate every call with `x-api-key: <API_KEY>`
// or `Authorization: Bearer <API_KEY>`. Served at GET /api/openapi (also behind the key).
const id = { type: "string" };
const body = (props: Record<string, unknown>, required: string[] = []) => ({
  required: true,
  content: { "application/json": { schema: { type: "object", properties: props, required } } },
});
const ok = { "200": { description: "OK" } };
const resource = (tag: string, extra: Record<string, unknown> = {}) => ({
  get: { tags: [tag], responses: ok, ...extra },
  post: { tags: [tag], responses: { "201": { description: "Created" }, ...errors } },
  patch: { tags: [tag], requestBody: body({ id }, ["id"]), responses: { ...ok, ...errors } },
  delete: { tags: [tag], requestBody: body({ id }, ["id"]), responses: { ...ok, ...errors } },
});

const err = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
const errors = {
  "400": err("Malformed JSON / missing id"), "401": err("Missing or invalid credentials"), "404": err("Not found"),
  "422": { description: "Validation failed, or a place name / payer / vehicle could not be resolved. Do NOT retry blindly: ask the user, using `suggestions` / `valid`.", content: { "application/json": { schema: { $ref: "#/components/schemas/UnprocessableEntity" } } } },
};
const createdScheduled = { "201": { description: "Created. Read `summary` back to the user to confirm.", content: { "application/json": { schema: { $ref: "#/components/schemas/ScheduledDriveCreated" } } } } };
const createdTrip = { "201": { description: "Created. Read `summary` back to the user to confirm.", content: { "application/json": { schema: { $ref: "#/components/schemas/TripCreated" } } } } };

const stopSchema = { oneOf: [
  { type: "string", description: "Place name or address" },
  { type: "object", properties: { address: { type: "string" }, lat: { type: "number" }, lng: { type: "number" } } },
] };
const scheduledProps = {
  date: { type: "string", example: "2026-11-26", description: "YYYY-MM-DD. Use with departure_time." },
  departure_time: { type: "string", example: "11:18 AM", description: "HH:mm (24h) or h:mm AM/PM" },
  departure: { type: "string", format: "date-time", description: "Full ISO 8601 departure; alternative to date + departure_time. Offset-less values are read in `timezone`." },
  timezone: { type: "string", example: "America/Anchorage", description: "IANA zone for offset-less times. Default: server APP_TIMEZONE, else UTC." },
  start: { type: "string", default: "Current location", description: "A saved-place name (\"Home\"), a recently used place name, a full street address, or \"Current location\". Names are resolved server-side; unresolvable names → 422. Alias: startAddress" },
  stops: { description: "Array of names/objects, or one string (several separated by `;`, `|` or newlines)", oneOf: [{ type: "array", items: stopSchema }, { type: "string" }] },
  end: { type: "string", description: "Same rules as start. Alias: endAddress. Defaults to the last stop." },
  title: { type: "string", description: "Default: \"Drive to <destination>\"" },
  notes: { type: "string" },
  category: { enum: ["COMMUTE", "ERRAND", "ROAD_TRIP", "SCHOOL", "WORK", "LEISURE", "OTHER"], default: "COMMUTE" },
  repeatRule: { enum: ["NONE", "DAILY", "WEEKDAYS", "WEEKLY"], default: "NONE", description: "Alias: repeat" },
  estimatedTravelTime: { type: "integer", description: "Seconds (default 0). Alternative: estimated_minutes" },
  paidBy: { type: "string", description: "Payer key or label (see GET /api/context payerGroups). Aliases: parents/parent/mom and dad → PARENTS; me/self → SELF. Default: the user's default payer. Alias: payer" },
  vehicle: { type: "string", description: "Vehicle name, case-insensitive, partial ok (\"van\" → \"Family Van\"). Default: the user's default vehicle. Alias: vehicleName" },
};
const scheduledBody = {
  required: true,
  description: "The object itself, OR the same object wrapped in a single field (e.g. {\"scheduled\": {...}}), OR either of those JSON-encoded as a string. snake_case and camelCase keys are both accepted.",
  content: { "application/json": { schema: { oneOf: [
    { type: "object", properties: scheduledProps },
    { type: "object", properties: { scheduled: { oneOf: [{ type: "object", properties: scheduledProps }, { type: "string", description: "JSON-encoded object" }] } } },
    { type: "string", description: "JSON-encoded object" },
  ] }, example: { date: "2026-11-26", departure_time: "11:18", start: "Current location", stops: ["Fred Meyer"], end: "Home", notes: "Round trip" } } },
};

const spec = {
  openapi: "3.1.0",
  info: { title: "Drive Tracker API", version: "1.0.0", description: "REST API for trips, fuel, vehicles and schedules. Distances in miles, durations in seconds." },
  servers: [{ url: "/" }],
  security: [{ apiKey: [] }, { bearer: [] }],
  components: { schemas: {
    UnprocessableEntity: { type: "object", required: ["error"], properties: {
      error: { type: "string" }, field: { type: "string", description: "First offending field, e.g. start, stops[0], end, paidBy, vehicleName, departure" },
      unresolved: { type: "array", items: { type: "string" }, description: "Place names that could not be resolved to a real street address" },
      hint: { type: "string" },
      suggestions: { type: "array", description: "Candidate saved places / previously used addresses to offer the user", items: { type: "object", properties: { label: { type: "string" }, address: { type: "string" }, lat: { type: "number" }, lng: { type: "number" }, source: { enum: ["saved_place", "recent_trip", "scheduled_drive"] } } } },
      valid: { type: "array", description: "Valid payer {key,label} or vehicle names when paidBy/vehicleName was unknown", items: {} },
      details: { type: "array", items: { type: "object" } },
    } },
    ResolvedLocation: { type: "object", properties: { field: { type: "string" }, input: { type: "string" }, address: { type: "string" }, lat: { type: "number" }, lng: { type: "number" }, label: { type: ["string", "null"] }, matchedBy: { enum: ["saved_place", "recent_trip", "scheduled_drive", "exact_address", "street_address", "coordinates", "current_location"] } } },
    ScheduledDriveCreated: { type: "object", description: "The stored ScheduledDrive (all columns) plus confirmation fields", properties: {
      id: { type: "string" }, title: { type: "string" }, startAddress: { type: "string" }, endAddress: { type: "string" }, departure: { type: "string", format: "date-time" }, scheduledArrival: { type: "string", format: "date-time" }, paidBy: { type: "string" }, vehicleName: { type: ["string", "null"] }, stops: { type: ["array", "null"], items: { type: "object" } },
      timezone: { type: "string" }, departureLocal: { type: "string", example: "Thursday, November 26, 2026 at 11:18 AM AKST" }, scheduledArrivalLocal: { type: "string" },
      paidByLabel: { type: "string", example: "Me" }, vehicle: { type: ["object", "null"], properties: { name: { type: "string" }, avgMpg: { type: ["number", "null"] } } },
      resolvedLocations: { type: "array", items: { $ref: "#/components/schemas/ResolvedLocation" } },
      summary: { type: "string", description: "Plain-language confirmation to read back to the user" },
    } },
    TripCreated: { type: "object", description: "The stored Trip (all columns) plus confirmation fields", properties: {
      id: { type: "string" }, timezone: { type: "string" }, dateLocal: { type: "string" }, paidByLabel: { type: "string" },
      vehicle: { type: ["object", "null"] }, resolvedLocations: { type: "array", items: { $ref: "#/components/schemas/ResolvedLocation" } }, summary: { type: "string" },
    } },
    Context: { type: "object", description: "See GET /api/context", properties: {
      now: { type: "string" }, timezone: { type: "string" }, timezoneWarning: { type: "string" },
      settings: { type: "object", properties: { defaultPaidBy: { type: "string" }, defaultPaidByLabel: { type: "string" }, defaultVehicle: { type: ["string", "null"] }, defaultVehicleSource: { type: ["string", "null"] }, homeAddress: { type: ["string", "null"] }, currency: { type: "string" }, distanceUnit: { type: "string" }, fuelPricePerGallon: { type: ["number", "null"] } } },
      savedPlaces: { type: "array", items: { type: "object", properties: { name: { type: "string" }, address: { type: "string" }, lat: { type: "number" }, lng: { type: "number" } } } },
      vehicles: { type: "array", items: { type: "object", properties: { name: { type: "string" }, make: { type: ["string", "null"] }, model: { type: ["string", "null"] }, year: { type: ["integer", "null"] }, avgMpg: { type: ["number", "null"] }, tankSize: { type: ["number", "null"] }, isDefault: { type: "boolean" } } } },
      payerGroups: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, isDefault: { type: "boolean" } } } },
      recentAddresses: { type: "array", items: { type: "object", properties: { address: { type: "string" }, lat: { type: "number" }, lng: { type: "number" } } } },
      recentTrips: { type: "array", items: { type: "object" } }, upcomingScheduled: { type: "array", items: { type: "object" } },
    } }, Error: { type: "object", required: ["error"], properties: { error: { type: "string" }, details: { type: "array", items: { type: "object", properties: { field: { type: "string" }, message: { type: "string" } } } } } } }, securitySchemes: {
    apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
    bearer: { type: "http", scheme: "bearer" },
  } },
  paths: {
    "/api/trips": (() => {
      const r = resource("Trips", { parameters: ["search", "category", "favorites", "from", "to", "sort", "order", "page", "pageSize", "full", "includeRoute"].map((name) => ({ name, in: "query", schema: { type: "string" } })) });
      const tripProps = {
        date: { type: "string", format: "date-time", description: "Default: now" },
        startAddress: scheduledProps.start, endAddress: scheduledProps.end,
        startLat: { type: "number" }, startLng: { type: "number" }, endLat: { type: "number" }, endLng: { type: "number" },
        distance: { type: "number", description: "Miles (required)" }, duration: { type: "integer", description: "Seconds (required)" },
        category: { enum: ["COMMUTE", "ERRAND", "ROAD_TRIP", "SCHOOL", "WORK", "LEISURE", "OTHER"], default: "OTHER" },
        paidBy: scheduledProps.paidBy, vehicle: scheduledProps.vehicle, notes: { type: "string" }, stops: scheduledProps.stops,
      };
      return { ...r, post: { tags: ["Trips"], summary: "Create a trip (place names resolved server-side)", requestBody: body(tripProps, ["distance", "duration"]), responses: { ...createdTrip, ...errors } } };
    })(),
    "/api/trips/{id}": { get: { tags: ["Trips"], parameters: [{ name: "id", in: "path", required: true, schema: id }], responses: { ...ok, "404": err("Trip not found") } } },
    "/api/trips/{id}/points": { get: { tags: ["Trips"], parameters: [{ name: "id", in: "path", required: true, schema: id }], responses: ok } },
    "/api/gas": resource("Gas"),
    "/api/vehicles": resource("Vehicles"),
    "/api/scheduled": (() => {
      const r = resource("Scheduled drives");
      r.get = { tags: ["Scheduled drives"], summary: "List scheduled drives", parameters: [
        { name: "upcoming", in: "query", schema: { type: "boolean" }, description: "Only enabled, non-canceled drives departing from an hour ago on, plus repeating ones" },
        { name: "limit", in: "query", schema: { type: "integer" } },
      ], responses: ok } as typeof r.get;
      return { ...r, post: { tags: ["Scheduled drives"], summary: "Create a scheduled drive (place names resolved server-side)", requestBody: scheduledBody, responses: { ...createdScheduled, ...errors } } };
    })(),
    "/api/context": { get: { tags: ["Context"], summary: "START HERE: defaults, saved places, vehicles, payer groups, recent addresses/trips, upcoming scheduled drives in one call", responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Context" } } } } } } },
    "/api/resolve": { get: { tags: ["Context"], summary: "Dry-run place-name resolution", parameters: [{ name: "q", in: "query", required: true, description: "Repeatable (max 10), e.g. ?q=Home&q=Fred%20Meyer", schema: { type: "array", items: { type: "string" } }, style: "form", explode: true }], responses: { "200": { description: "{results:[{input, ok, address, lat, lng, label, matchedBy} | {input, ok:false, error, hint, suggestions}]}" }, "400": err("No q given") } } },
    "/api/saved-places": resource("Saved places"),
    "/api/payer-groups": resource("Payer groups"),
    "/api/settings": { get: { tags: ["Settings"], responses: ok }, put: { tags: ["Settings"], responses: ok } },
    "/api/stats": { get: { tags: ["Stats"], parameters: [{ name: "period", in: "query", schema: { enum: ["30d", "90d", "12m"] } }], responses: ok } },
    "/api/analytics": { get: { tags: ["Stats"], responses: ok } },
    "/api/export": { get: { tags: ["Export"], responses: ok } },
  },
};

export async function GET() {
  return Response.json(spec);
}
