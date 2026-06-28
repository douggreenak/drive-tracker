"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

// Only allow same-site, absolute-path redirects. Rejects protocol-relative
// (`//evil.com`) and backslash (`/\evil.com`) URLs that browsers treat as
// off-site, preventing an open-redirect via a crafted `?next=` link.
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Incorrect password. Try again.");
        setPassword("");
        return;
      }
      // Full reload so the proxy re-reads the new cookie for the destination.
      window.location.assign(safeNext(searchParams.get("next")));
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input
        type="password"
        className="md-text-field"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        autoComplete="current-password"
        aria-label="Password"
      />
      {error && (
        <p style={{ color: "var(--md-error)" }} className="text-sm">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="md-filled-button"
        disabled={loading || password.length === 0}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-full flex items-center justify-center p-6"
      style={{
        background:
          "radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, var(--md-primary) 22%, var(--md-surface)) 0%, var(--md-surface) 60%)",
      }}
    >
      <div
        className="md-card w-full max-w-sm"
        style={{ padding: "2.5rem 2rem", textAlign: "center" }}
      >
        <div
          className="mx-auto mb-5 flex items-center justify-center"
          style={{
            width: "4rem",
            height: "4rem",
            borderRadius: "var(--md-radius-full)",
            background: "var(--md-primary-container)",
            color: "var(--md-on-primary-container)",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 17H3v-5l2-5h11l3 5h1a1 1 0 011 1v4h-2" />
            <circle cx="7.5" cy="17.5" r="1.8" />
            <circle cx="16.5" cy="17.5" r="1.8" />
            <path d="M9 17h6" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold mb-1">Drive Tracker</h1>
        <p
          className="text-sm mb-7"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          Enter your password to continue.
        </p>
        <div style={{ textAlign: "left" }}>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
