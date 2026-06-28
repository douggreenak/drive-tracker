import crypto from "node:crypto";

// Single-user password protection for the web dashboard + a shared API key for
// the iOS app. All secrets live in environment variables (set in Vercel):
//   SITE_PASSWORD — the password typed on the /login page
//   API_KEY       — sent by the iOS app as the `x-api-key` header
//   AUTH_SECRET   — used to sign the session cookie (falls back to SITE_PASSWORD)
// None of these are ever sent to the browser; the cookie only holds a signed token.

export const SESSION_COOKIE = "dt_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

function signingSecret(): string {
  // Prefer a dedicated secret; fall back to the password so a missing AUTH_SECRET
  // still produces signed (not forgeable) cookies in simple setups.
  return process.env.AUTH_SECRET || process.env.SITE_PASSWORD || "";
}

// Constant-time string comparison. Both sides are hashed to a fixed 32-byte
// digest first, so neither the length nor the contents of the secret leak
// through comparison timing.
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

// Token format: `v1.<expiryEpochSeconds>.<hmac>`
export function createSessionToken(): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `v1.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token || !signingSecret()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, exp, sig] = parts;
  const payload = `${version}.${exp}`;
  if (!safeEqual(sig, sign(payload))) return false;
  const expSeconds = Number(exp);
  if (!Number.isFinite(expSeconds) || expSeconds * 1000 < Date.now()) return false;
  return true;
}

export function isValidPassword(input: string): boolean {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return false; // No password configured → deny rather than allow.
  return safeEqual(input, expected);
}

export function isValidApiKey(provided: string | null | undefined): boolean {
  const expected = process.env.API_KEY;
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}
