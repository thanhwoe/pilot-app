import {
  errorResponseSchema,
  groupListResponseSchema,
  groupResponseSchema,
  signInResponseSchema,
} from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryAuthStore } from "../auth/memory-store";
import { createMemoryGroupStore } from "./memory-store";

const authSecret = "test-secret-that-is-at-least-32-characters";
const minute = 60_000;

/** An app on the in-memory stores, with a clock the test moves. */
function setup() {
  const sent: { email: string; code: string }[] = [];
  let now = new Date("2026-11-02T10:00:00Z");
  const app = buildApp({
    pingDb: async () => true,
    corsOrigins: [],
    version: "1.2.3",
    authStore: createMemoryAuthStore(),
    groupStore: createMemoryGroupStore(),
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
