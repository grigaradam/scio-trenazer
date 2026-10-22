import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Test JSON files are read from disk on the server – make sure Vercel ships them.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*.json"],
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
