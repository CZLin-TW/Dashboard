import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: pkg.version,
  },
  // Development only: other devices on the home network allowed to open a dev server (a trial copy).
  allowedDevOrigins: (process.env.DEV_ORIGINS ?? "").split(",").filter(Boolean),
};

export default nextConfig;
