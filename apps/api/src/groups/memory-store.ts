import { randomUUID } from "node:crypto";
import type { GroupStore, StoredGroup } from "./store";

interface MemoryGroupStore extends GroupStore {
  /** Adds a member directly, for tests, until invites exist. */
  addMember(groupId: string, userId: string, now: Date): void;
}

/**
 * A `GroupStore` held in memory, for route tests. The contract suite in `store.contract.ts`
 * keeps it in step with the Postgres store.
 */
export function createMemoryGroupStore(): MemoryGroupStore {
  const groups = new Map<string, { id: string; name: string; createdAt: Date }>();
  /** Each group's members and when they joined. */
  const members = new Map<string, Map<string, Date>>();

  function withCount(groupId: string): StoredGroup {
    const group = groups.get(groupId);
    if (!group) {
      throw new Error(`No group ${groupId}`);
    }
    return { ...group, memberCount: members.get(groupId)?.size ?? 0 };
  }

  return {
    async createGroup({ name, creatorId, now }) {
      const id = randomUUID();
      groups.set(id, { id, name, createdAt: now });
      members.set(id, new Map([[creatorId, now]]));
      return withCount(id);
    },

    async listGroupsForMember(userId) {
      return [...members]
        .filter(([, userIds]) => userIds.has(userId))
        .map(([groupId]) => withCount(groupId))
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        );
    },

    async findGroupForMember(groupId, userId) {
      return members.get(groupId)?.has(userId) ? withCount(groupId) : null;
    },

    async listMembers(groupId) {
      return [...(members.get(groupId) ?? [])]
        .map(([userId, joinedAt]) => ({ userId, joinedAt }))
        .sort(
          (a, b) =>
            a.joinedAt.getTime() - b.joinedAt.getTime() ||
            (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
        );
    },

    addMember(groupId, userId, now) {
      const group = members.get(groupId);
      if (group && !group.has(userId)) {
        group.set(userId, now);
      }
    },
  };
}
