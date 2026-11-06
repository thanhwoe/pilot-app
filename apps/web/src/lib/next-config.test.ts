import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig() {
  vi.resetModules();
  return (await import("../../next.config")).default;
}

describe("next.config allowedDevOrigins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is empty when ALLOWED_DEV_ORIGINS is unset", async () => {
    vi.stubEnv("ALLOWED_DEV_ORIGINS", undefined);

    expect((await loadConfig()).allowedDevOrigins).toEqual([]);
  });

  it("is empty when ALLOWED_DEV_ORIGINS is empty", async () => {
    vi.stubEnv("ALLOWED_DEV_ORIGINS", "");

    expect((await loadConfig()).allowedDevOrigins).toEqual([]);
  });

  it("splits on commas, trims and drops empty entries", async () => {
    vi.stubEnv("ALLOWED_DEV_ORIGINS", " 192.168.1.20, mac.local ,");

    expect((await loadConfig()).allowedDevOrigins).toEqual(["192.168.1.20", "mac.local"]);
  });

  it("leaves the other settings as they were", async () => {
    const config = await loadConfig();

    expect(config.cacheComponents).toBe(true);
    expect(config.transpilePackages).toEqual(["@gop/shared"]);
  });
});
