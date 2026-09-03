import type { NextConfig } from "next";

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const nextConfig: NextConfig = {
  devIndicators: false,
  // Hosts other than localhost that may open the dev server (a LAN address, a
  // tunnel). Set DEV_ALLOWED_ORIGINS="192.168.1.10,foo.example.com" locally.
  allowedDevOrigins: list(process.env.DEV_ALLOWED_ORIGINS),
  // Server Actions compare the public Origin with the Host, which breaks when
  // the app is served through a proxy or tunnel. Widen it only for the origins
  // named in SERVER_ACTION_ALLOWED_ORIGINS.
  experimental: {
    serverActions: {
      allowedOrigins: list(process.env.SERVER_ACTION_ALLOWED_ORIGINS),
    },
  },
};

export default nextConfig;
