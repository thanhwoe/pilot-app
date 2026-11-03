import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

// Client code: web, mobile and the shared flows. The API is the server that answers 401.
const clientSources = ["apps/web/src", "apps/mobile/src", "packages/shared/src"];

// The one place that reads a 401 as a rejected session, and the schema that lists the error codes.
const allowed = ["packages/shared/src/session-guard.ts", "packages/shared/src/auth.ts"];

function sourceFiles(dir: string): string[] {
  return readdirSync(join(repoRoot, dir), { recursive: true, encoding: "utf8" })
    .map((file) => join(dir, file))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file));
}

describe("a rejected session is read in one place (#31)", () => {
  it("[security] no client code reads the 401 `unauthorized` code outside guardSession", () => {
    const offenders = clientSources
      .flatMap(sourceFiles)
      .map((file) => relative(".", file).split(sep).join("/"))
      .filter((file) => !allowed.includes(file))
      .filter((file) => /["']unauthorized["']/.test(readFileSync(join(repoRoot, file), "utf8")));

    // Go through `guardSession` (packages/shared/src/session-guard.ts) instead of comparing the
    // error code in a screen: a screen that forgets the branch shows a retry message, not sign-in.
    expect(offenders).toEqual([]);
  });
});
