import {
  createAuthApi,
  createGroupsApi,
  type HealthResponse,
  healthResponseSchema,
} from "@gop/shared";
import { Platform } from "react-native";

// The Android emulator reaches the host machine at 10.0.2.2, not localhost.
const defaultApiUrl = Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://localhost:3001";

export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? defaultApiUrl;

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${apiUrl}/health`);
  return healthResponseSchema.parse(await res.json());
}

/** The #5 auth endpoints, through the client the web uses too. */
export const authApi = createAuthApi(apiUrl);

/** The #14 group endpoints. */
export const groupsApi = createGroupsApi(apiUrl);
