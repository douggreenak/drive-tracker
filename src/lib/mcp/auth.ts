import crypto from "node:crypto";

// MCP credentials are separate from the REST API's shared `API_KEY`: a signed, expiring bearer
// token verified against MCP_TOKEN_SECRET. An API key can't open /mcp, and an MCP token can't call
// /api/*. Mint one with `npm run mcp:token`.
export const MCP_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365 * 5; // 5 years

function sign(payload: string): string {
  return crypto.createHmac("sha256", process.env.MCP_TOKEN_SECRET || "").update(payload).digest("base64url");
}

// Format: `mcp1.<expiryEpochSeconds>.<hmac>`
export function createMcpToken(ttlSeconds = MCP_TOKEN_TTL_SECONDS): string {
  const payload = `mcp1.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyMcpToken(token: string | null | undefined): boolean {
  if (!token || !process.env.MCP_TOKEN_SECRET) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "mcp1") return false;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  const exp = Number(parts[1]);
  return Number.isFinite(exp) && exp * 1000 > Date.now();
}

export function bearerToken(headers: Headers): string | null {
  return headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1].trim() ?? null;
}
