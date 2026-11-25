import { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { createMcpToken } from "@/lib/mcp/auth";

// Connection details for the Settings page. Browser session only: an API key must not be able to
// read itself back or mint MCP tokens, so the API-key path the proxy allows is rejected here.
function hasSession(request: NextRequest) {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  if (!hasSession(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({
    baseUrl: request.nextUrl.origin,
    apiKey: process.env.API_KEY || null,
    mcpAvailable: Boolean(process.env.MCP_TOKEN_SECRET),
  });
}

// Mint a fresh 5-year MCP token (stateless; rotating MCP_TOKEN_SECRET revokes all of them).
export async function POST(request: NextRequest) {
  if (!hasSession(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.MCP_TOKEN_SECRET) {
    return Response.json({ error: "MCP_TOKEN_SECRET is not configured" }, { status: 503 });
  }
  return Response.json({ token: createMcpToken() });
}
