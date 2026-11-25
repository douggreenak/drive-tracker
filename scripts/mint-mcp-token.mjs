// Mint an MCP bearer token (format must match src/lib/mcp/auth.ts). Usage:
//   MCP_TOKEN_SECRET=... npm run mcp:token [-- <days>]     (default: 5 years)
import crypto from "node:crypto";

const secret = process.env.MCP_TOKEN_SECRET;
if (!secret) {
  console.error("Set MCP_TOKEN_SECRET (same value as in Vercel) first.");
  process.exit(1);
}
const days = Number(process.argv[2]) || 365 * 5;
const payload = `mcp1.${Math.floor(Date.now() / 1000) + days * 86400}`;
console.log(`${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`);
