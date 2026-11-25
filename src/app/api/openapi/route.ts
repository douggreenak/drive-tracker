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
  post: { tags: [tag], responses: { "201": { description: "Created" } } },
  patch: { tags: [tag], requestBody: body({ id }, ["id"]), responses: ok },
  delete: { tags: [tag], requestBody: body({ id }, ["id"]), responses: ok },
});

const spec = {
  openapi: "3.1.0",
  info: { title: "Drive Tracker API", version: "1.0.0", description: "REST API for trips, fuel, vehicles and schedules. Distances in miles, durations in seconds." },
  servers: [{ url: "/" }],
  security: [{ apiKey: [] }, { bearer: [] }],
  components: { securitySchemes: {
    apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
    bearer: { type: "http", scheme: "bearer" },
  } },
  paths: {
    "/api/trips": resource("Trips", { parameters: ["search", "category", "favorites", "from", "to", "sort", "order", "page", "pageSize", "full", "includeRoute"].map((name) => ({ name, in: "query", schema: { type: "string" } })) }),
    "/api/trips/{id}": { get: { tags: ["Trips"], parameters: [{ name: "id", in: "path", required: true, schema: id }], responses: ok } },
    "/api/trips/{id}/points": { get: { tags: ["Trips"], parameters: [{ name: "id", in: "path", required: true, schema: id }], responses: ok } },
    "/api/gas": resource("Gas"),
    "/api/vehicles": resource("Vehicles"),
    "/api/scheduled": resource("Scheduled drives"),
    "/api/saved-places": resource("Saved places"),
    "/api/payer-groups": resource("Payer groups"),
    "/api/settings": { get: { tags: ["Settings"], responses: ok }, put: { tags: ["Settings"], responses: ok } },
    "/api/stats": { get: { tags: ["Stats"], parameters: [{ name: "period", in: "query", schema: { enum: ["30d", "90d", "12m"] } }], responses: ok } },
    "/api/analytics": { get: { tags: ["Stats"], responses: ok } },
    "/api/export": { get: { tags: ["Export"], responses: ok } },
    "/api/mcp": { post: { tags: ["MCP"], summary: "Model Context Protocol server (Streamable HTTP, JSON-RPC)", responses: ok } },
  },
};

export async function GET() {
  return Response.json(spec);
}
