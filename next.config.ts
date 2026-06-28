import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Baseline hardening headers on every response.
        source: "/:path*",
        headers: [
          // Block this app from being framed (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Don't let browsers MIME-sniff responses into a different type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak full URLs (with query params) to other origins.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
