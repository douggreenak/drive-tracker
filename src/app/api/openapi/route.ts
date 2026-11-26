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
const errors = { "400": err("Malformed JSON / missing id"), "401": err("Missing or invalid credentials"), "404": err("Not found"), "422": err("Validation failed; see `details`") };

const stopSchema = { oneOf: [
  { type: "string", description: "Place name or address" },
  { type: "object", properties: { address: { type: "string" }, lat: { type: "number" }, lng: { type: "number" } } },
] };
const scheduledProps = {
  date: { type: "string", example: "2026-11-26", description: "YYYY-MM-DD. Use with departure_time." },
  departure_time: { type: "string", example: "11:18 AM", description: "HH:mm (24h) or h:mm AM/PM" },
  departure: { type: "string", format: "date-time", description: "Full ISO 8601 departure; alternative to date + departure_time. Offset-less values are read in `timezone`." },
  timezone: { type: "string", example: "America/Anchorage", description: "IANA zone for offset-less times. Default: server APP_TIMEZONE, else UTC." },
  start: { type: "string", default: "Current location", description: "Alias: startAddress" },
  stops: { description: "Array of names/objects, or one string (several separated by `;`, `|` or newlines)", oneOf: [{ type: "array", items: stopSchema }, { type: "string" }] },
  end: { type: "string", description: "Alias: endAddress. Defaults to the last stop." },
  title: { type: "string", description: "Default: \"Drive to <destination>\"" },
  notes: { type: "string" },
  category: { enum: ["COMMUTE", "ERRAND", "ROAD_TRIP", "SCHOOL", "WORK", "LEISURE", "OTHER"], default: "COMMUTE" },
  repeatRule: { enum: ["NONE", "DAILY", "WEEKDAYS", "WEEKLY"], default: "NONE", description: "Alias: repeat" },
  estimatedTravelTime: { type: "integer", description: "Seconds (default 0). Alternative: estimated_minutes" },
  paidBy: { type: "string", default: "SELF" },
  vehicleName: { type: "string" },
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
  components: { schemas: { Error: { type: "object", required: ["error"], properties: { error: { type: "string" }, details: { type: "array", items: { type: "object", properties: { field: { type: "string" }, message: { type: "string" } } } } } } }, securitySchemes: {
    apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
    bearer: { type: "http", scheme: "bearer" },
  } },
  paths: {
    "/api/trips": (() => {
      const r = resource("Trips", { parameters: ["search", "category", "favorites", "from", "to", "sort", "order", "page", "pageSize", "full", "includeRoute"].map((name) => ({ name, in: "query", schema: { type: "string" } })) });
      const tripProps = {
        date: { type: "string", format: "date-time", description: "Default: now" },
        startAddress: { type: "string" }, endAddress: { type: "string" },
        startLat: { type: "number" }, startLng: { type: "number" }, endLat: { type: "number" }, endLng: { type: "number" },
        distance: { type: "number", description: "Miles (required)" }, duration: { type: "integer", description: "Seconds (required)" },
        category: { enum: ["COMMUTE", "ERRAND", "ROAD_TRIP", "SCHOOL", "WORK", "LEISURE", "OTHER"], default: "OTHER" },
        paidBy: { type: "string", default: "SELF" }, notes: { type: "string" }, stops: scheduledProps.stops,
      };
      return { ...r, post: { tags: ["Trips"], summary: "Create a trip", requestBody: body(tripProps, ["distance", "duration"]), responses: { "201": { description: "Created" }, ...errors } } };
    })(),
    "/api/trips/{id}": { get: { tags: ["Trips"], parameters: [{ name: "id", in: "path", required: true, schema: id }], responses: { ...ok, "404": err("Trip not found") } } },
    "/api/trips/{id}/points": { get: { tags: ["Trips"], parameters: [{ name: "id", in: "path", required: true, schema: id }], responses: ok } },
    "/api/gas": resource("Gas"),
    "/api/vehicles": resource("Vehicles"),
    "/api/scheduled": (() => {
      const r = resource("Scheduled drives");
      return { ...r, post: { tags: ["Scheduled drives"], summary: "Create a scheduled drive", requestBody: scheduledBody, responses: { "201": { description: "Created" }, ...errors } } };
    })(),
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
