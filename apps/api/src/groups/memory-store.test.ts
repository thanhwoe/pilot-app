import { randomUUID } from "node:crypto";
import { createMemoryGroupStore } from "./memory-store";
import { describeGroupStoreContract } from "./store.contract";

describeGroupStoreContract("In-memory", async () => {
  const store = createMemoryGroupStore();
  return {
    store,
    newUser: async () => randomUUID(),
    addMember: async (groupId, userId, now) => store.addMember(groupId, userId, now),
    close: async () => {},
  };
});
