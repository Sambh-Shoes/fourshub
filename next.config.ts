import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" }, // the Odoo upload is about 1.5 MB
  },
  outputFileTracingIncludes: {
    "/**": ["./db/schema.sql"],
    "/import": ["./mapping/attributes.csv", "./db/schema.sql"],
  },
};

export default nextConfig;
