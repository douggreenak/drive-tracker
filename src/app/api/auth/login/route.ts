import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, isValidPassword, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

// Best-effort brute-force throttle. On serverless this map is per-warm-instance rather than global,
// so it's not a hard guarantee — but it meaningfully slows credential stuffing against any single
// instance and adds a lockout window without requiring external infrastructure. Only *failed*
// attempts count; a success clears the record.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; first: number }>();

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

function isBlocked(ip: string): boolean {
  const rec = failures.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return rec.count >= MAX_FAILURES;
}

function recordFailure(ip: string) {
  const now = Date.now();
  const rec = failures.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    failures.set(ip, { count: 1, first: now });
  } else {
    rec.count += 1;
  }
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isBlocked(ip)) {
    return Response.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(WINDOW_MS / 1000) } },
    );
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!isValidPassword(password)) {
    recordFailure(ip);
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }

  failures.delete(ip); // successful login clears the throttle

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
