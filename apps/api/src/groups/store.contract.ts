import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GroupStore } from "./store";

const minute = 60_000;
const t0 = new Date("2026-11-02T10:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

export interface GroupStoreHarness {
  store: GroupStore;
  /** Creates a user the store can make a member, and returns its id. */
  newUser: () => Promise<string>;
  /** Adds a member directly, standing in for invites until they exist. */
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
      expect(await store.listGroupsForMember(ana)).toEqual([group]);
    });

    it("lets two groups share a name", async () => {
      const ana = await harness.newUser();

      const first = await store.createGroup({ name: "Nhà", creatorId: ana, now: t0 });
      const second = await store.createGroup({ name: "Nhà", creatorId: ana, now: at(minute) });

      expect(first.id).not.toBe(second.id);
      expect(await store.listGroupsForMember(ana)).toEqual([second, first]);
    });

    it("lists my groups newest first, with their member counts", async () => {
      const ana = await harness.newUser();
      const bao = await harness.newUser();
      const older = await store.createGroup({ name: "Older", creatorId: ana, now: t0 });
      const newer = await store.createGroup({ name: "Newer", creatorId: ana, now: at(minute) });
      await harness.addMember(older.id, bao, at(2 * minute));

      expect(await store.listGroupsForMember(ana)).toEqual([newer, { ...older, memberCount: 2 }]);
    });

    it("breaks a tie in creation time the same way every time", async () => {
      const ana = await harness.newUser();
      const a = await store.createGroup({ name: "A", creatorId: ana, now: t0 });
      const b = await store.createGroup({ name: "B", creatorId: ana, now: t0 });

      const expected = [a, b].sort((x, y) => (x.id < y.id ? 1 : -1));
      expect(await store.listGroupsForMember(ana)).toEqual(expected);
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
