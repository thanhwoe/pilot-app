import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // @gop/shared ships TypeScript source, so Next compiles it.
  transpilePackages: ["@gop/shared"],
  // Hostnames (no scheme, no port) that may reach `next dev` besides localhost, such as a phone
  // on the same network. Read from the environment so no address of ours is committed.
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
};

export default nextConfig;
