import type { NextConfig } from "next";

const REPLIT_DOMAIN = "e73401b8-df2b-4a74-af3a-901457bb301e-00-2ilidhsyejt0l.janeway.replit.dev";

const devOrigins: string[] = [REPLIT_DOMAIN];

if (process.env.REPLIT_DEV_DOMAIN && process.env.REPLIT_DEV_DOMAIN !== REPLIT_DOMAIN) {
  devOrigins.push(process.env.REPLIT_DEV_DOMAIN);
}
if (process.env.REPLIT_DOMAINS) {
  for (const d of process.env.REPLIT_DOMAINS.split(",")) {
    if (!devOrigins.includes(d.trim())) devOrigins.push(d.trim());
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
