import { type AuthApi, createAuthApi } from "@gop/shared";

/** The API the web server talks to. Read at call time, so one build works in every environment. */
export function authApi(): AuthApi {
  return createAuthApi(process.env.API_URL ?? "http://localhost:3001");
}
