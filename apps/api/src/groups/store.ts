import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../db/client";
import { groupMembers, groups } from "../db/schema";

/** A group as the store returns it. Routes turn `createdAt` into the shared ISO string. */
export interface StoredGroup {
  id: string;
  name: string;
  memberCount: number;
  createdAt: Date;
}

export interface NewGroup {
  name: string;
  creatorId: string;
  now: Date;
}

/** Persistence for groups and who belongs to them. */
export interface GroupStore {
  /** Saves the group and the creator's membership at once, so a group never lacks a member. */
  createGroup(group: NewGroup): Promise<StoredGroup>;
  /** The user's groups, newest first; ties in creation time go by id, descending. */
  listGroupsForMember(userId: string): Promise<StoredGroup[]>;
  /**
   * The membership check for every route that reads or writes a group: the group when the user
   * belongs to it, otherwise null, whether or not the group exists.
   */
  findGroupForMember(groupId: string, userId: string): Promise<StoredGroup | null>;
}

export function createPostgresGroupStore(db: Database["db"]): GroupStore {
  /** The caller's memberships; `groupMembers` itself counts everyone in each group. */
  const mine = alias(groupMembers, "mine");

  function selectGroupsOf(userId: string, filter?: SQL) {
    return db
      .select({
        id: groups.id,
        name: groups.name,
        createdAt: groups.createdAt,
        memberCount: count(groupMembers.userId),
      })
      .from(mine)
      .innerJoin(groups, eq(groups.id, mine.groupId))
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .where(and(eq(mine.userId, userId), filter))
      .groupBy(groups.id);
  }

  return {
    createGroup({ name, creatorId, now }) {
      return db.transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({ name, createdAt: now })
          .returning({ id: groups.id, name: groups.name, createdAt: groups.createdAt });
        if (!group) {
          throw new Error("Inserting the group returned no row");
        }
        await tx
          .insert(groupMembers)
          .values({ groupId: group.id, userId: creatorId, joinedAt: now });
        return { ...group, memberCount: 1 };
      });
    },

    listGroupsForMember(userId) {
      return selectGroupsOf(userId).orderBy(desc(groups.createdAt), desc(groups.id));
    },

    async findGroupForMember(groupId, userId) {
      const [group] = await selectGroupsOf(userId, eq(groups.id, groupId));
      return group ?? null;
    },
  };
}
