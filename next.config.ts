import type { NextConfig } from "next";

const devOrigins: string[] = [];
if (process.env.REPLIT_DEV_DOMAIN) {
  devOrigins.push(process.env.REPLIT_DEV_DOMAIN);
}
if (process.env.REPLIT_DOMAINS) {
  devOrigins.push(...process.env.REPLIT_DOMAINS.split(","));
}

const nextConfig: NextConfig = {
  ...(devOrigins.length > 0 && { allowedDevOrigins: devOrigins }),
};

export default nextConfig;
