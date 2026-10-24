import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" }, // the Odoo upload is about 1.5 MB
  },
  outputFileTracingIncludes: {
    "/import": ["./mapping/attributes.csv"],
  },
};

export default nextConfig;
