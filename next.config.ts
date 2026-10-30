import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Style reference images are uploaded to YouCam from the job routes (lib/server/jobs/mapper.ts).
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/catalog/refs/**/*"],
  },
  partialPrefetching: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders({ production: process.env.NODE_ENV === "production" }) }];
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
