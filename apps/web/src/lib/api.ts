import { type AuthApi, createAuthApi, createGroupsApi, type GroupsApi } from "@gop/shared";

/** The API the web server talks to. Read at call time, so one build works in every environment. */
function apiUrl(): string {
  return process.env.API_URL ?? "http://localhost:3001";
}

export function authApi(): AuthApi {
  return createAuthApi(apiUrl());
}

export function groupsApi(): GroupsApi {
  return createGroupsApi(apiUrl());
}
