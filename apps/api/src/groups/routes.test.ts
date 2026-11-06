import { randomUUID } from "node:crypto";
import {
  createInviteResponseSchema,
  errorResponseSchema,
  groupListResponseSchema,
  groupResponseSchema,
  invitePreviewResponseSchema,
  inviteTokenSchema,
  meResponseSchema,
  SESSION_TTL_MS,
  signInResponseSchema,
} from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryAuthStore } from "../auth/memory-store";
import { hashSecret } from "../auth/secrets";
import { createMemoryExpenseStore } from "../expenses/memory-store";
import { createTestDb } from "../test/db";
import { createMemoryGroupStore } from "./memory-store";
import { createPostgresGroupStore, type GroupStore } from "./store";

const authSecret = "test-secret-that-is-at-least-32-characters";
const minute = 60_000;

/** An app on the in-memory stores, unless a test passes its own group store, with a clock the test moves. */
function setup(groupStore: GroupStore = createMemoryGroupStore()) {
  const sent: { email: string; code: string }[] = [];
  let now = new Date("2026-11-02T10:00:00Z");
  const app = buildApp({
    pingDb: async () => true,
    corsOrigins: [],
    version: "1.2.3",
    authStore: createMemoryAuthStore(),
    groupStore,
    expenseStore: createMemoryExpenseStore(),
    authSecret,
    sendSignInCode: async (email, code) => {
      sent.push({ email, code });
    },
    now: () => now,
  });
  const bearer = (token?: string) => (token ? { authorization: `Bearer ${token}` } : {});

  return {
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    /** Signs in with a fresh code and returns the session token. */
    async signIn(email: string) {
      await app.inject({ method: "POST", url: "/auth/code", payload: { email } });
      const code = sent.at(-1)?.code;
      const res = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, code },
      });
      return signInResponseSchema.parse(res.json()).token;
    },
    createGroup(token: string | undefined, payload?: Record<string, unknown>) {
      return app.inject({ method: "POST", url: "/groups", headers: bearer(token), payload });
    },
    listGroups(token?: string) {
      return app.inject({ method: "GET", url: "/groups", headers: bearer(token) });
    },
    getGroup(token: string | undefined, id: string) {
      return app.inject({ method: "GET", url: `/groups/${id}`, headers: bearer(token) });
    },
    /** The signed-in user's id. */
    async userId(token: string) {
      const res = await app.inject({ method: "GET", url: "/me", headers: bearer(token) });
      return meResponseSchema.parse(res.json()).id;
    },
    makeInvite(token: string | undefined, groupId: string) {
      return app.inject({
        method: "POST",
        url: `/groups/${groupId}/invite`,
        headers: bearer(token),
      });
    },
    previewInvite(token: string | undefined, payload?: unknown) {
      return app.inject({
        method: "POST",
        url: "/invites/preview",
        headers: bearer(token),
        payload: payload as Record<string, unknown> | undefined,
      });
    },
    joinWithInvite(token: string | undefined, payload?: unknown) {
      return app.inject({
        method: "POST",
        url: "/invites/join",
        headers: bearer(token),
        payload: payload as Record<string, unknown> | undefined,
      });
    },
  };
}

/** A group made by Ana with an invite link, and Bao, who is signed in but not a member. */
async function inviteWorld(groupStore: GroupStore = createMemoryGroupStore()) {
  const app = setup(groupStore);
  const ana = await app.signIn("ana@example.com");
  const bao = await app.signIn("bao@example.com");
  const group = groupResponseSchema.parse((await app.createGroup(ana, { name: "Nhà" })).json());
  const made = await app.makeInvite(ana, group.id);
  const { token } = createInviteResponseSchema.parse(made.json());
  const names = async (userToken: string) =>
    groupListResponseSchema.parse((await app.listGroups(userToken)).json()).groups;
  return { ...app, ana, bao, group, token, names };
}

describe("POST /groups", () => {
  it("AC 1: answers 201 with the group, member count 1, and the group is in my groups", async () => {
    const { signIn, createGroup, listGroups } = setup();
    const token = await signIn("ana@example.com");

    const res = await createGroup(token, { name: "Đà Lạt" });

    expect(res.statusCode).toBe(201);
    const group = groupResponseSchema.parse(res.json());
    expect(group).toEqual({
      id: expect.any(String),
      name: "Đà Lạt",
      memberCount: 1,
      createdAt: "2026-11-02T10:00:00.000Z",
    });
    expect(groupListResponseSchema.parse((await listGroups(token)).json())).toEqual({
      groups: [{ ...group, hasInvite: false }],
    });
  });

  it("AC 2: saves the name without the spaces around it", async () => {
    const { signIn, createGroup } = setup();
    const token = await signIn("ana@example.com");

    const res = await createGroup(token, { name: "  Nhà  " });

    expect(groupResponseSchema.parse(res.json()).name).toBe("Nhà");
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a name of only spaces", { name: "   " }],
    ["no name", {}],
    ["no body", undefined],
  ])("AC 3: answers 400 for %s and creates no group", async (_case, payload) => {
    const { signIn, createGroup, listGroups } = setup();
    const token = await signIn("ana@example.com");

    const res = await createGroup(token, payload);

    expect(res.statusCode).toBe(400);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "invalid_request" });
    expect((await listGroups(token)).json()).toEqual({ groups: [] });
  });

  it("AC 4: creates a second group with the same name, and lists both", async () => {
    const { signIn, createGroup, listGroups, advance } = setup();
    const token = await signIn("ana@example.com");

    const first = groupResponseSchema.parse((await createGroup(token, { name: "Nhà" })).json());
    advance(minute);
    const second = await createGroup(token, { name: "Nhà" });

    expect(second.statusCode).toBe(201);
    expect(groupListResponseSchema.parse((await listGroups(token)).json()).groups).toEqual([
      { ...groupResponseSchema.parse(second.json()), hasInvite: false },
      { ...first, hasInvite: false },
    ]);
  });
});

describe("GET /groups", () => {
  it("AC 5: lists each group's id, name, member count and creation time, newest first", async () => {
    const { signIn, createGroup, listGroups, advance } = setup();
    const token = await signIn("ana@example.com");
    await createGroup(token, { name: "Older" });
    advance(minute);
    await createGroup(token, { name: "Newer" });

    const res = await listGroups(token);

    expect(res.statusCode).toBe(200);
    expect(groupListResponseSchema.parse(res.json()).groups).toEqual([
      {
        id: expect.any(String),
        name: "Newer",
        memberCount: 1,
        createdAt: "2026-11-02T10:01:00.000Z",
        hasInvite: false,
      },
      {
        id: expect.any(String),
        name: "Older",
        memberCount: 1,
        createdAt: "2026-11-02T10:00:00.000Z",
        hasInvite: false,
      },
    ]);
  });

  it("AC 6: lists no groups for a user who belongs to none", async () => {
    const { signIn, listGroups } = setup();

    const res = await listGroups(await signIn("ana@example.com"));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ groups: [] });
  });
});

describe("GET /groups/:id", () => {
  it("AC 7: gives a member the group's id, name, member count and creation time", async () => {
    const { signIn, createGroup, getGroup } = setup();
    const token = await signIn("ana@example.com");
    const created = groupResponseSchema.parse((await createGroup(token, { name: "Nhà" })).json());

    const res = await getGroup(token, created.id);

    expect(res.statusCode).toBe(200);
    expect(groupResponseSchema.parse(res.json())).toEqual(created);
  });
});

describe("[security] group access", () => {
  it("AC 8: leaves a group I do not belong to out of my list", async () => {
    const { signIn, createGroup, listGroups } = setup();
    const ana = await signIn("ana@example.com");
    const bao = await signIn("bao@example.com");
    await createGroup(bao, { name: "Bao's" });

    expect((await listGroups(ana)).json()).toEqual({ groups: [] });
  });

  it("AC 9: answers a group I do not belong to exactly as an id no group has", async () => {
    const { signIn, createGroup, getGroup } = setup();
    const ana = await signIn("ana@example.com");
    const bao = await signIn("bao@example.com");
    const baos = groupResponseSchema.parse((await createGroup(bao, { name: "Bao's" })).json());

    const theirs = await getGroup(ana, baos.id);
    const unknown = await getGroup(ana, randomUUID());

    expect(theirs.statusCode).toBe(404);
    expect(errorResponseSchema.parse(theirs.json())).toEqual({ error: "not_found" });
    expect(unknown.statusCode).toBe(theirs.statusCode);
    expect(unknown.body).toBe(theirs.body);
  });

  it("AC 10: answers 404 not_found for an id that is not a group id", async () => {
    const { signIn, getGroup } = setup();
    const ana = await signIn("ana@example.com");

    const res = await getGroup(ana, "not-a-uuid");

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("AC 10: answers 404 not_found for a malformed id on Postgres too, which rejects non-UUIDs", async () => {
    const testDb = await createTestDb();
    try {
      const { signIn, getGroup } = setup(createPostgresGroupStore(testDb.database.db));
      const ana = await signIn("ana@example.com");

      const res = await getGroup(ana, "not-a-uuid");

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    } finally {
      await testDb.drop();
    }
  });

  describe("AC 11: answers 401 without a live session, and creates no group", () => {
    async function tokens() {
      const app = setup();
      const expired = await app.signIn("old@example.com");
      app.advance(SESSION_TTL_MS);
      const ana = await app.signIn("ana@example.com");
      const group = groupResponseSchema.parse((await app.createGroup(ana, { name: "Nhà" })).json());
      return {
        app,
        ana,
        group,
        cases: [
          ["no token", undefined],
          ["a wrong token", "made-up-token"],
          ["an expired token", expired],
        ] as const,
      };
    }

    it("on POST /groups", async () => {
      const { app, ana, cases } = await tokens();
      for (const [label, token] of cases) {
        const res = await app.createGroup(token, { name: "Trộm" });
        expect(res.statusCode, label).toBe(401);
        expect(res.json(), label).toEqual({ error: "unauthorized" });
      }
      const old = await app.signIn("old@example.com");
      expect((await app.listGroups(old)).json()).toEqual({ groups: [] });
      expect(groupListResponseSchema.parse((await app.listGroups(ana)).json()).groups).toHaveLength(
        1,
      );
    });

    it("on GET /groups", async () => {
      const { app, cases } = await tokens();
      for (const [label, token] of cases) {
        const res = await app.listGroups(token);
        expect(res.statusCode, label).toBe(401);
        expect(res.json(), label).toEqual({ error: "unauthorized" });
      }
    });

    it("on GET /groups/:id", async () => {
      const { app, group, cases } = await tokens();
      for (const [label, token] of cases) {
        const res = await app.getGroup(token, group.id);
        expect(res.statusCode, label).toBe(401);
        expect(res.json(), label).toEqual({ error: "unauthorized" });
      }
    });

    it("checks the session before the body", async () => {
      const { app } = await tokens();
      expect((await app.createGroup(undefined, { name: "" })).statusCode).toBe(401);
    });
  });

  it("AC 12: accepts a name of 100 characters, and answers 400 for 101 with no group", async () => {
    const { signIn, createGroup, listGroups } = setup();
    const token = await signIn("ana@example.com");

    const tooLong = await createGroup(token, { name: "a".repeat(101) });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json()).toEqual({ error: "invalid_request" });
    expect((await listGroups(token)).json()).toEqual({ groups: [] });

    expect((await createGroup(token, { name: "a".repeat(100) })).statusCode).toBe(201);
  });
});

describe("POST /groups/:id/invite", () => {
  it("#94 AC 1: answers 201 with a token for the group, and the group then has a link", async () => {
    const { ana, group, token, names } = await inviteWorld();

    expect(inviteTokenSchema.safeParse(token).success).toBe(true);
    expect(await names(ana)).toEqual([{ ...group, hasInvite: true }]);
  });

  it("#94 AC 1: lets a member who did not create the group make the link", async () => {
    const store = createMemoryGroupStore();
    const { bao, group, userId, makeInvite } = await inviteWorld(store);
    store.addMember(group.id, await userId(bao), new Date("2026-11-02T10:01:00Z"));

    const res = await makeInvite(bao, group.id);

    expect(res.statusCode).toBe(201);
    expect(
      inviteTokenSchema.safeParse(createInviteResponseSchema.parse(res.json()).token).success,
    ).toBe(true);
  });

  it("#94 AC 1: says hasInvite false for a group with no link", async () => {
    const { ana, createGroup, names, advance } = await inviteWorld();
    advance(minute);
    await createGroup(ana, { name: "Chưa có liên kết" });

    expect((await names(ana)).map((group) => [group.name, group.hasInvite])).toEqual([
      ["Chưa có liên kết", false],
      ["Nhà", true],
    ]);
  });

  it("[security] #94 AC 6: answers a non-member exactly as an id no group has, and a malformed id", async () => {
    const { bao, group, ana, makeInvite, names } = await inviteWorld();

    const theirs = await makeInvite(bao, group.id);
    const unknown = await makeInvite(bao, randomUUID());
    const malformed = await makeInvite(bao, "not-a-uuid");

    expect(theirs.statusCode).toBe(404);
    expect(errorResponseSchema.parse(theirs.json())).toEqual({ error: "not_found" });
    expect(unknown.statusCode).toBe(theirs.statusCode);
    expect(unknown.body).toBe(theirs.body);
    expect(malformed.statusCode).toBe(theirs.statusCode);
    expect(malformed.body).toBe(theirs.body);
    expect(theirs.body).not.toContain("token");
    expect(await names(ana)).toEqual([{ ...group, hasInvite: true }]);
  });

  it("[security] #94 AC 6: a non-member's try does not replace the group's link", async () => {
    const { bao, group, token, makeInvite, previewInvite } = await inviteWorld();

    await makeInvite(bao, group.id);

    expect((await previewInvite(bao, { token })).statusCode).toBe(200);
  });

  it("[security] #94 AC 8: keeps only the hash of the token", async () => {
    const calls: string[] = [];
    const store = createMemoryGroupStore();
    const spied: GroupStore = {
      ...store,
      setInviteTokenHash: async (groupId, tokenHash) => {
        calls.push(tokenHash);
        return store.setInviteTokenHash(groupId, tokenHash);
      },
    };

    const { token } = await inviteWorld(spied);

    expect(calls).toEqual([hashSecret(token, authSecret)]);
    expect(calls[0]).not.toBe(token);
    expect(calls[0]).not.toContain(token);
  });
});

describe("POST /invites/preview and /invites/join", () => {
  it("#94 AC 2: shows a non-member the group's name, and joining adds the group to their list", async () => {
    const { bao, group, token, previewInvite, joinWithInvite, names } = await inviteWorld();

    const preview = await previewInvite(bao, { token });
    expect(preview.statusCode).toBe(200);
    expect(invitePreviewResponseSchema.parse(preview.json())).toEqual({
      groupName: "Nhà",
      alreadyMember: false,
    });
    expect(await names(bao)).toEqual([]);

    const joined = await joinWithInvite(bao, { token });

    expect(joined.statusCode).toBe(200);
    expect(groupResponseSchema.parse(joined.json())).toEqual({ ...group, memberCount: 2 });
    expect(await names(bao)).toEqual([{ ...group, memberCount: 2, hasInvite: true }]);
  });

  it("#94 AC 3: tells a member they are one, and joining again changes nothing", async () => {
    const { ana, bao, group, token, previewInvite, joinWithInvite, names } = await inviteWorld();
    expect(invitePreviewResponseSchema.parse((await previewInvite(ana, { token })).json())).toEqual(
      { groupName: "Nhà", alreadyMember: true },
    );

    const asMember = await joinWithInvite(ana, { token });
    await joinWithInvite(bao, { token });
    const again = await joinWithInvite(bao, { token });

    expect(asMember.statusCode).toBe(200);
    expect(groupResponseSchema.parse(asMember.json()).memberCount).toBe(1);
    expect(again.statusCode).toBe(200);
    expect(groupResponseSchema.parse(again.json()).memberCount).toBe(2);
    expect(await names(ana)).toEqual([{ ...group, memberCount: 2, hasInvite: true }]);
  });

  describe("[security] #94 AC 5: answers any token that does not work the same, and joins no one", () => {
    const wrongTokens: [string, () => string][] = [
      ["made up, with the right shape", () => "Z".repeat(43)],
      ["random, with the right shape", () => randomUUID().replaceAll("-", "").padEnd(43, "q")],
      ["too short", () => "abc"],
      ["too long", () => "A".repeat(44)],
      ["with characters a token never has", () => `${"A".repeat(42)}/`],
      ["empty", () => ""],
      ["very long", () => "A".repeat(10_000)],
    ];

    it.each(wrongTokens)("on preview and on join, a token that is %s", async (_name, make) => {
      const w = await inviteWorld();
      const baseline = {
        preview: await w.previewInvite(w.bao, { token: "Z".repeat(43) }),
        join: await w.joinWithInvite(w.bao, { token: "Z".repeat(43) }),
      };

      const preview = await w.previewInvite(w.bao, { token: make() });
      const join = await w.joinWithInvite(w.bao, { token: make() });

      expect(baseline.preview.statusCode).toBe(404);
      expect(errorResponseSchema.parse(baseline.preview.json())).toEqual({ error: "not_found" });
      expect([preview.statusCode, preview.body]).toEqual([
        baseline.preview.statusCode,
        baseline.preview.body,
      ]);
      expect([join.statusCode, join.body]).toEqual([baseline.join.statusCode, baseline.join.body]);
      expect(await w.names(w.bao)).toEqual([]);
    });
  });

  it("[security] #94 AC 7: after a new link, the old token answers like a made-up one and joins no one, and the new one works", async () => {
    const {
      ana,
      bao,
      group,
      token: oldToken,
      makeInvite,
      previewInvite,
      joinWithInvite,
      names,
    } = await inviteWorld();
    const madeUp = { token: "Z".repeat(43) };
    const newToken = createInviteResponseSchema.parse(
      (await makeInvite(ana, group.id)).json(),
    ).token;

    const oldPreview = await previewInvite(bao, { token: oldToken });
    const oldJoin = await joinWithInvite(bao, { token: oldToken });

    expect(newToken).not.toBe(oldToken);
    expect(oldPreview.statusCode).toBe(404);
    expect(oldPreview.body).toBe((await previewInvite(bao, madeUp)).body);
    expect(oldJoin.statusCode).toBe(404);
    expect(oldJoin.body).toBe((await joinWithInvite(bao, madeUp)).body);
    expect(await names(bao)).toEqual([]);

    const joined = await joinWithInvite(bao, { token: newToken });

    expect(joined.statusCode).toBe(200);
    expect(await names(bao)).toHaveLength(1);
    expect((await names(ana))[0]?.hasInvite).toBe(true);
  });

  it("#94: answers 400 for a body with no token, or one that is not a string", async () => {
    const { bao, previewInvite, joinWithInvite } = await inviteWorld();

    for (const payload of [undefined, {}, { token: 42 }, { token: null }]) {
      expect((await previewInvite(bao, payload)).statusCode).toBe(400);
      expect((await joinWithInvite(bao, payload)).statusCode).toBe(400);
    }
  });

  describe("#94: answers 401 without a live session, and joins no one", () => {
    async function tokens() {
      const store = createMemoryGroupStore();
      const w = await inviteWorld(store);
      const expired = await w.signIn("old@example.com");
      w.advance(SESSION_TTL_MS);
      const ana = await w.signIn("ana2@example.com");
      return {
        ...w,
        store,
        ana2: ana,
        cases: [
          ["no token", undefined],
          ["a wrong token", "made-up-token"],
          ["an expired token", expired],
        ] as const,
      };
    }

    it("on POST /groups/:id/invite, /invites/preview and /invites/join", async () => {
      const { group, token, store, cases, makeInvite, previewInvite, joinWithInvite } =
        await tokens();
      for (const [label, userToken] of cases) {
        for (const res of [
          await makeInvite(userToken, group.id),
          await previewInvite(userToken, { token }),
          await joinWithInvite(userToken, { token }),
        ]) {
          expect(res.statusCode, label).toBe(401);
          expect(res.json(), label).toEqual({ error: "unauthorized" });
        }
      }
      expect(await store.listMembers(group.id)).toHaveLength(1);
    });

    it("checks the session before the body", async () => {
      const { previewInvite, joinWithInvite } = await tokens();

      expect((await previewInvite(undefined, {})).statusCode).toBe(401);
      expect((await joinWithInvite(undefined, {})).statusCode).toBe(401);
    });
  });
});
