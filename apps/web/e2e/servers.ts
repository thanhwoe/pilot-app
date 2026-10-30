/** Ports and URLs of the servers Playwright starts. Not 3000/3001, so a running `pnpm dev` is left alone. */
export const WEB_PORT = 3100;
export const API_PORT = 3101;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

/** Its own database, so E2E runs never touch dev data. */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://gop:gop@localhost:5432/gop_e2e";
