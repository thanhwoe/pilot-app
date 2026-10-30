import type { SessionStore } from "@gop/shared";
import * as SecureStore from "expo-secure-store";

const KEY = "gop_session";

/** The session token lives only here: the iOS keychain or Android's encrypted storage. */
export const secureSessionStore: SessionStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token) => SecureStore.setItemAsync(KEY, token),
  delete: () => SecureStore.deleteItemAsync(KEY),
};
