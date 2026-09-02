import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Allow the development server to be opened from the LAN address used by
  // the local demo. Production origins are still governed by the deployment.
  allowedDevOrigins: ["192.168.1.70"],
  // Devin previews sit behind a reverse proxy. Next compares the public
  // Origin with the proxy Host for Server Actions; allow only Devin's preview
  // subdomains so demo mutations work without weakening the check elsewhere.
  experimental: {
    serverActions: {
      allowedOrigins: ["*.preview.devinapps.com"],
    },
  },
};

export default nextConfig;
