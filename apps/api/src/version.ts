import packageJson from "../package.json" with { type: "json" };

/** The `version` in `apps/api/package.json`. */
export const apiVersion: string = packageJson.version;
