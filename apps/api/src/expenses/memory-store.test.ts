import { randomUUID } from "node:crypto";
import { createMemoryExpenseStore } from "./memory-store";
import { describeExpenseStoreContract } from "./store.contract";

describeExpenseStoreContract("In-memory", async () => ({
  store: createMemoryExpenseStore(),
  newUser: async () => randomUUID(),
  newGroup: async () => randomUUID(),
  close: async () => {},
}));
