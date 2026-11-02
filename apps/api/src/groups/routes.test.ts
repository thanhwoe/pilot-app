import { randomUUID } from "node:crypto";
import {
  errorResponseSchema,
  groupListResponseSchema,
  groupResponseSchema,
  SESSION_TTL_MS,
  signInResponseSchema,
} from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryAuthStore } from "../auth/memory-store";
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
  };
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
      groups: [group],
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
      groupResponseSchema.parse(second.json()),
      first,
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
      },
      {
        id: expect.any(String),
        name: "Older",
        memberCount: 1,
        createdAt: "2026-11-02T10:00:00.000Z",
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
