import { createMemoryAuthStore } from "./memory-store";
import { describeAuthStoreContract } from "./store.contract";

describeAuthStoreContract("In-memory", async () => ({
  store: createMemoryAuthStore(),
  close: async () => {},
}));
