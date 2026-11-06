import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm";
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

/** A group in the caller's list: the group, and whether it has an invite link. */
export interface StoredGroupListItem extends StoredGroup {
  hasInvite: boolean;
}

/** The group an invite link leads to. */
export interface InviteTarget {
  id: string;
  name: string;
}

/** A member of a group, and when they joined it. */
export interface GroupMember {
  userId: string;
  joinedAt: Date;
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
  listGroupsForMember(userId: string): Promise<StoredGroupListItem[]>;
  /**
   * The membership check for every route that reads or writes a group: the group when the user
   * belongs to it, otherwise null, whether or not the group exists.
   */
  findGroupForMember(groupId: string, userId: string): Promise<StoredGroup | null>;
  /**
   * Everyone in the group, in the order they joined; members who joined at the same time go by
   * user id. Empty for a group that doesn't exist. Callers check membership first.
   */
  listMembers(groupId: string): Promise<GroupMember[]>;
  /** Keeps the hash of the group's invite token in place of any earlier one, which then finds nothing. */
  setInviteTokenHash(groupId: string, tokenHash: string): Promise<void>;
  /** The group whose current invite token has this hash, or null. */
  findGroupByInviteHash(tokenHash: string): Promise<InviteTarget | null>;
  /** Makes the user a member. True when they were added, false when they already were one. */
  joinGroup(groupId: string, userId: string, now: Date): Promise<boolean>;
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
        hasInvite: sql<boolean>`${groups.inviteTokenHash} is not null`,
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
      return group
        ? {
            id: group.id,
            name: group.name,
            memberCount: group.memberCount,
            createdAt: group.createdAt,
          }
        : null;
    },

    listMembers(groupId) {
      return db
        .select({ userId: groupMembers.userId, joinedAt: groupMembers.joinedAt })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupId))
        .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.userId));
    },

    async setInviteTokenHash(groupId, tokenHash) {
      await db.update(groups).set({ inviteTokenHash: tokenHash }).where(eq(groups.id, groupId));
    },

    async findGroupByInviteHash(tokenHash) {
      const [group] = await db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(eq(groups.inviteTokenHash, tokenHash));
      return group ?? null;
    },

    async joinGroup(groupId, userId, now) {
      const added = await db
        .insert(groupMembers)
        .values({ groupId, userId, joinedAt: now })
        .onConflictDoNothing()
        .returning({ userId: groupMembers.userId });
      return added.length > 0;
    },
  };
}
