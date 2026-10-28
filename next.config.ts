import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Test JSON files are read from disk on the server – make sure Vercel ships them.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*.json"],
  },
  // the service worker must never be served stale, or notification fixes would not reach installed apps
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
