import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // @gop/shared ships TypeScript source, so Next compiles it.
  transpilePackages: ["@gop/shared"],
};

export default nextConfig;
