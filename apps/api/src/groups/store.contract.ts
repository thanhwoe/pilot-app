import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GroupStore } from "./store";

const minute = 60_000;
const t0 = new Date("2026-11-02T10:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
/** A group as the list returns it: the stored group, and whether it has an invite link. */
const listed = <G extends object>(group: G, hasInvite = false) => ({ ...group, hasInvite });

export interface GroupStoreHarness {
  store: GroupStore;
  /** Creates a user the store can make a member, and returns its id. */
  newUser: () => Promise<string>;
  /** Adds a member directly with a chosen join time, which `joinGroup` (it takes `now`) can't. */
  addMember: (groupId: string, userId: string, now: Date) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * The behaviour every `GroupStore` must have. Runs against Postgres and the in-memory fake, so
 * route tests that use the fake see what production sees.
 */
export function describeGroupStoreContract(name: string, open: () => Promise<GroupStoreHarness>) {
  describe(`${name} GroupStore`, () => {
    let harness: GroupStoreHarness;
    let store: GroupStore;

    beforeAll(async () => {
      harness = await open();
      store = harness.store;
    });

    afterAll(async () => {
      await harness.close();
    });

    it("creates a group whose only member is its creator", async () => {
      const ana = await harness.newUser();

      const group = await store.createGroup({ name: "Đà Lạt", creatorId: ana, now: t0 });

      expect(group).toEqual({
        id: expect.any(String),
        name: "Đà Lạt",
        memberCount: 1,
        createdAt: t0,
      });
      expect(await store.listGroupsForMember(ana)).toEqual([listed(group)]);
    });

    it("lets two groups share a name", async () => {
      const ana = await harness.newUser();

      const first = await store.createGroup({ name: "Nhà", creatorId: ana, now: t0 });
      const second = await store.createGroup({ name: "Nhà", creatorId: ana, now: at(minute) });

      expect(first.id).not.toBe(second.id);
      expect(await store.listGroupsForMember(ana)).toEqual([listed(second), listed(first)]);
    });

    it("lists my groups newest first, with their member counts", async () => {
      const ana = await harness.newUser();
      const bao = await harness.newUser();
      const older = await store.createGroup({ name: "Older", creatorId: ana, now: t0 });
      const newer = await store.createGroup({ name: "Newer", creatorId: ana, now: at(minute) });
      await harness.addMember(older.id, bao, at(2 * minute));

      expect(await store.listGroupsForMember(ana)).toEqual([
        listed(newer),
        listed({ ...older, memberCount: 2 }),
      ]);
    });

    it("breaks a tie in creation time the same way every time", async () => {
      const ana = await harness.newUser();
      const a = await store.createGroup({ name: "A", creatorId: ana, now: t0 });
      const b = await store.createGroup({ name: "B", creatorId: ana, now: t0 });

      const expected = [a, b].sort((x, y) => (x.id < y.id ? 1 : -1));
      expect(await store.listGroupsForMember(ana)).toEqual(expected.map((group) => listed(group)));
    });

    it("lists no groups for a user who belongs to none", async () => {
      expect(await store.listGroupsForMember(await harness.newUser())).toEqual([]);
    });

    it("leaves other members' groups out of my list", async () => {
      const ana = await harness.newUser();
      const bao = await harness.newUser();
      await store.createGroup({ name: "Bao's", creatorId: bao, now: t0 });

      expect(await store.listGroupsForMember(ana)).toEqual([]);
    });

    it("lists a group's members with when they joined, by join time and then user id", async () => {
      const ana = await harness.newUser();
      const bao = await harness.newUser();
      const cy = await harness.newUser();
      const dee = await harness.newUser();
      const eli = await harness.newUser();
      const group = await store.createGroup({ name: "Chuyến đi", creatorId: ana, now: t0 });
      await harness.addMember(group.id, bao, at(3 * minute));
      await harness.addMember(group.id, cy, at(minute));
      await harness.addMember(group.id, dee, at(3 * minute));
      await harness.addMember(group.id, eli, at(3 * minute));

      const sameTime = [bao, dee, eli].sort((x, y) => (x < y ? -1 : 1));
      expect(await store.listMembers(group.id)).toEqual([
        { userId: ana, joinedAt: t0 },
        { userId: cy, joinedAt: at(minute) },
        ...sameTime.map((userId) => ({ userId, joinedAt: at(3 * minute) })),
      ]);
    });

    it("lists no members for a group that does not exist", async () => {
      expect(await store.listMembers(randomUUID())).toEqual([]);
    });

    it("#94 AC 1: says which of my groups have an invite link", async () => {
      const ana = await harness.newUser();
      const withLink = await store.createGroup({ name: "Có liên kết", creatorId: ana, now: t0 });
      const without = await store.createGroup({ name: "Chưa có", creatorId: ana, now: at(minute) });

      expect(await store.listGroupsForMember(ana)).toEqual([listed(without), listed(withLink)]);

      await store.setInviteTokenHash(withLink.id, "hash-1");
      expect(await store.listGroupsForMember(ana)).toEqual([
        listed(without),
        listed(withLink, true),
      ]);

      await store.setInviteTokenHash(withLink.id, "hash-2");
      expect(await store.listGroupsForMember(ana)).toEqual([
        listed(without),
        listed(withLink, true),
      ]);
    });

    it("#94 AC 7: finds the group by its current invite hash, and a replaced hash finds nothing", async () => {
      const ana = await harness.newUser();
      const group = await store.createGroup({ name: "Chuyến đi", creatorId: ana, now: t0 });
      await store.setInviteTokenHash(group.id, "first-hash");
      expect(await store.findGroupByInviteHash("first-hash")).toEqual({
        id: group.id,
        name: "Chuyến đi",
      });

      await store.setInviteTokenHash(group.id, "second-hash");

      expect(await store.findGroupByInviteHash("first-hash")).toBeNull();
      expect(await store.findGroupByInviteHash("second-hash")).toEqual({
        id: group.id,
        name: "Chuyến đi",
      });
    });

    it("#94 AC 5: finds nothing for a hash no group has", async () => {
      expect(await store.findGroupByInviteHash(`unknown-${randomUUID()}`)).toBeNull();
    });

    it("#94 AC 2: joinGroup makes a user a member, who then sees the group", async () => {
      const ana = await harness.newUser();
      const bao = await harness.newUser();
      const group = await store.createGroup({ name: "Chuyến đi", creatorId: ana, now: t0 });

      expect(await store.joinGroup(group.id, bao, at(minute))).toBe(true);

      expect(await store.findGroupForMember(group.id, bao)).toEqual({ ...group, memberCount: 2 });
      expect(await store.listMembers(group.id)).toEqual([
        { userId: ana, joinedAt: t0 },
        { userId: bao, joinedAt: at(minute) },
      ]);
    });

    it("#94 AC 3: joinGroup does nothing for someone who is already a member", async () => {
      const ana = await harness.newUser();
      const group = await store.createGroup({ name: "Chuyến đi", creatorId: ana, now: t0 });

      expect(await store.joinGroup(group.id, ana, at(minute))).toBe(false);

      expect(await store.findGroupForMember(group.id, ana)).toEqual(group);
      expect(await store.listMembers(group.id)).toEqual([{ userId: ana, joinedAt: t0 }]);
    });

    it("finds a group for a member, and for nobody else", async () => {
      const ana = await harness.newUser();
      const bao = await harness.newUser();
      const group = await store.createGroup({ name: "Ana's", creatorId: ana, now: t0 });

      expect(await store.findGroupForMember(group.id, ana)).toEqual(group);
      expect(await store.findGroupForMember(group.id, bao)).toBeNull();
      expect(await store.findGroupForMember(randomUUID(), ana)).toBeNull();
    });
  });
}
