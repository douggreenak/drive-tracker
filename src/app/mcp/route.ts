import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";

// Remote MCP server (Streamable HTTP, stateless). Auth is enforced by src/proxy.ts with a dedicated
// MCP token (`Authorization: Bearer <token>`, see src/lib/mcp/auth.ts) — not the REST API key.
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  // Stateless: a fresh server + transport per request, JSON responses (no SSE session to keep alive).
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
