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
  // Upload de foto do vestido passa por Server Action; o limite padrão é 1MB.
  // Sobe pra 12MB (o bruto antes do sharp otimizar) — ver src/lib/vestidos/fotos.ts.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
