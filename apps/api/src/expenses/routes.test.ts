import { randomUUID } from "node:crypto";
import {
  type CreateExpenseBody,
  errorResponseSchema,
  expenseResponseSchema,
  groupResponseSchema,
  meResponseSchema,
  SESSION_TTL_MS,
  signInResponseSchema,
} from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryAuthStore } from "../auth/memory-store";
import { createMemoryGroupStore } from "../groups/memory-store";
import { createPostgresGroupStore, type GroupStore } from "../groups/store";
import { createTestDb } from "../test/db";
import { createMemoryExpenseStore } from "./memory-store";
import { createPostgresExpenseStore, type ExpenseStore } from "./store";

const authSecret = "test-secret-that-is-at-least-32-characters";
const minute = 60_000;
const t0 = new Date("2026-11-06T10:00:00Z");

/** An app on the in-memory stores, unless a test passes its own, with a clock the test moves. */
function setup(stores: { groupStore?: GroupStore; expenseStore?: ExpenseStore } = {}) {
  const groupStore = stores.groupStore ?? createMemoryGroupStore();
  const expenseStore = stores.expenseStore ?? createMemoryExpenseStore();
  const sent: { email: string; code: string }[] = [];
  let now = t0;
  const app = buildApp({
    pingDb: async () => true,
    corsOrigins: [],
    version: "1.2.3",
    authStore: createMemoryAuthStore(),
    groupStore,
    expenseStore,
    authSecret,
    sendSignInCode: async (email, code) => {
      sent.push({ email, code });
    },
    now: () => now,
  });
  const bearer = (token?: string) => (token ? { authorization: `Bearer ${token}` } : {});

  return {
    groupStore,
    expenseStore,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    /** Signs in with a fresh code and returns the session token and the user's id. */
    async signIn(email: string) {
      await app.inject({ method: "POST", url: "/auth/code", payload: { email } });
      const res = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, code: sent.at(-1)?.code },
      });
      const { token } = signInResponseSchema.parse(res.json());
      const me = await app.inject({ method: "GET", url: "/me", headers: bearer(token) });
      return { token, id: meResponseSchema.parse(me.json()).id };
    },
    async createGroup(token: string) {
      const res = await app.inject({
        method: "POST",
        url: "/groups",
        headers: bearer(token),
        payload: { name: "Chuyến đi" },
      });
      return groupResponseSchema.parse(res.json()).id;
    },
    postExpense(token: string | undefined, groupId: string, payload?: unknown) {
      return app.inject({
        method: "POST",
        url: `/groups/${groupId}/expenses`,
        headers: bearer(token),
        payload: payload as Record<string, unknown> | undefined,
      });
    },
  };
}

/**
 * Ana's group of Ana (joined first), Bao and Cy. They are members through the in-memory store's
 * `addMember`, standing in for invites. `tie` makes Bao and Cy join at the same moment.
 */
async function world(options: { tie?: boolean } = {}) {
  const app = setup();
  const ana = await app.signIn("ana@example.com");
  const bao = await app.signIn("bao@example.com");
  const cy = await app.signIn("cy@example.com");
  const groupId = await app.createGroup(ana.token);
  const memberStore = app.groupStore as ReturnType<typeof createMemoryGroupStore>;
  memberStore.addMember(groupId, bao.id, new Date(t0.getTime() + minute));
  memberStore.addMember(groupId, cy.id, new Date(t0.getTime() + (options.tie ? 1 : 2) * minute));

  const body = (overrides: Record<string, unknown> = {}) => ({
    payerId: ana.id,
    amount: 90_000,
    description: "Ăn tối",
    splitBetween: [ana.id, bao.id, cy.id],
    ...overrides,
  });
  /** An expense's shares as `userId → amount`. */
  const shares = (res: { json(): unknown }) =>
    Object.fromEntries(
      expenseResponseSchema.parse(res.json()).shares.map((share) => [share.userId, share.amount]),
    );

  return { ...app, ana, bao, cy, groupId, body, shares };
}

describe("POST /groups/:id/expenses", () => {
  it("#95 AC 1: answers 201 with the expense and three shares of 30000, and stores it", async () => {
    const { ana, bao, cy, groupId, body, postExpense, expenseStore } = await world();

    const res = await postExpense(ana.token, groupId, body());

    expect(res.statusCode).toBe(201);
    expect(expenseResponseSchema.parse(res.json())).toEqual({
      id: expect.any(String),
      groupId,
      payerId: ana.id,
      amount: 90_000,
      description: "Ăn tối",
      createdAt: "2026-11-06T10:00:00.000Z",
      shares: [ana.id, bao.id, cy.id].sort().map((userId) => ({ userId, amount: 30_000 })),
    });
    const stored = await expenseStore.listExpenses(groupId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ payerId: ana.id, amount: 90_000, description: "Ăn tối" });
    expect(stored[0]?.shares).toHaveLength(3);
  });

  it("#95 AC 2: gives the extra VND of 100000 to the payer, so Ana gets 33334", async () => {
    const { ana, bao, cy, groupId, body, postExpense, shares } = await world();

    const res = await postExpense(ana.token, groupId, body({ amount: 100_000 }));

    expect(shares(res)).toEqual({ [ana.id]: 33_334, [bao.id]: 33_333, [cy.id]: 33_333 });
  });

  it("#95 AC 2: gives the payer the first extra VND even when they joined last", async () => {
    const { ana, bao, cy, groupId, body, postExpense, shares } = await world();

    const res = await postExpense(cy.token, groupId, body({ payerId: cy.id, amount: 100_000 }));

    expect(shares(res)).toEqual({ [ana.id]: 33_333, [bao.id]: 33_333, [cy.id]: 33_334 });
  });

  it("#95 AC 3: leaves a payer outside the split with no share", async () => {
    const { ana, bao, cy, groupId, body, postExpense, shares } = await world();

    const res = await postExpense(
      ana.token,
      groupId,
      body({ amount: 100_000, splitBetween: [bao.id, cy.id] }),
    );

    expect(res.statusCode).toBe(201);
    expect(shares(res)).toEqual({ [bao.id]: 50_000, [cy.id]: 50_000 });
  });

  it("#95 AC 3: gives the extra VND of 100001 to the member who joined first", async () => {
    const { ana, bao, cy, groupId, body, postExpense, shares } = await world();

    const res = await postExpense(
      ana.token,
      groupId,
      body({ amount: 100_001, splitBetween: [cy.id, bao.id] }),
    );

    expect(shares(res)).toEqual({ [bao.id]: 50_001, [cy.id]: 50_000 });
  });

  it("#95 AC 2: breaks a tie in joining time by the lower user id", async () => {
    const { ana, bao, cy, groupId, body, postExpense, shares } = await world({ tie: true });
    const [first, second] = [bao.id, cy.id].sort();

    const res = await postExpense(
      ana.token,
      groupId,
      body({ amount: 100_001, splitBetween: [bao.id, cy.id] }),
    );

    expect(shares(res)).toEqual({ [first as string]: 50_001, [second as string]: 50_000 });
  });

  it("#95 A3: gives the same shares whatever order the request lists the split in", async () => {
    const { ana, bao, cy, groupId, body, postExpense, shares } = await world();

    const forward = await postExpense(ana.token, groupId, body({ amount: 100_001 }));
    const reversed = await postExpense(
      ana.token,
      groupId,
      body({ amount: 100_001, splitBetween: [cy.id, bao.id, ana.id] }),
    );

    expect(shares(reversed)).toEqual(shares(forward));
  });

  it("#95 A1: lets a member add an expense that another member paid", async () => {
    const { bao, cy, groupId, body, postExpense, expenseStore } = await world();

    const res = await postExpense(bao.token, groupId, body({ payerId: cy.id }));

    expect(res.statusCode).toBe(201);
    expect(expenseResponseSchema.parse(res.json()).payerId).toBe(cy.id);
    expect(await expenseStore.listExpenses(groupId)).toHaveLength(1);
  });

  it("#95 AC 7: accepts 1 VND, 100000000 VND and a description of 200 characters", async () => {
    const { ana, groupId, body, postExpense } = await world();

    const one = await postExpense(ana.token, groupId, body({ amount: 1, splitBetween: [ana.id] }));
    const most = await postExpense(ana.token, groupId, body({ amount: 100_000_000 }));
    const long = await postExpense(ana.token, groupId, body({ description: "a".repeat(200) }));

    expect([one.statusCode, most.statusCode, long.statusCode]).toEqual([201, 201, 201]);
  });

  it("#95 AC 8: stores and returns the description without the spaces around it", async () => {
    const { ana, groupId, body, postExpense, expenseStore } = await world();

    const res = await postExpense(ana.token, groupId, body({ description: "  Ăn tối  " }));

    expect(expenseResponseSchema.parse(res.json()).description).toBe("Ăn tối");
    expect((await expenseStore.listExpenses(groupId))[0]?.description).toBe("Ăn tối");
  });

  describe("#95 AC 6: answers 400 invalid_request and stores nothing for", () => {
    const outsider = randomUUID();
    const cases: [string, (w: Awaited<ReturnType<typeof world>>) => unknown][] = [
      ["an amount of 0", (w) => w.body({ amount: 0 })],
      ["a negative amount", (w) => w.body({ amount: -5 })],
      ["an amount that is not whole", (w) => w.body({ amount: 1000.5 })],
      ["an amount above 100000000", (w) => w.body({ amount: 100_000_001 })],
      ["an amount sent as a string", (w) => w.body({ amount: "90000" })],
      ["no amount", (w) => w.body({ amount: undefined })],
      ["an empty description", (w) => w.body({ description: "" })],
      ["a description of only spaces", (w) => w.body({ description: "   " })],
      ["a description of 201 characters", (w) => w.body({ description: "a".repeat(201) })],
      ["an empty split", (w) => w.body({ splitBetween: [] })],
      ["a split that repeats a member", (w) => w.body({ splitBetween: [w.ana.id, w.ana.id] })],
      ["a split that names a non-member", (w) => w.body({ splitBetween: [w.ana.id, outsider] })],
      ["a split with an id that is not an id", (w) => w.body({ splitBetween: [w.ana.id, "x"] })],
      ["a payer who is not a member", (w) => w.body({ payerId: outsider })],
      ["a payer that is not an id", (w) => w.body({ payerId: "ana" })],
      ["no body", () => undefined],
    ];

    it.each(cases)("%s", async (_name, payload) => {
      const w = await world();

      const res = await w.postExpense(w.ana.token, w.groupId, payload(w));

      expect(res.statusCode).toBe(400);
      expect(errorResponseSchema.parse(res.json())).toEqual({ error: "invalid_request" });
      expect(await w.expenseStore.listExpenses(w.groupId)).toEqual([]);
    });
  });

  it("#95 A2: rejects an empty split and a repeated member with nothing stored", async () => {
    const { ana, groupId, body, postExpense, expenseStore } = await world();

    const empty = await postExpense(ana.token, groupId, body({ splitBetween: [] }));
    const repeated = await postExpense(
      ana.token,
      groupId,
      body({ splitBetween: [ana.id, ana.id] }),
    );

    expect([empty.statusCode, repeated.statusCode]).toEqual([400, 400]);
    expect(await expenseStore.listExpenses(groupId)).toEqual([]);
  });
});

describe("[security] #95 expense access", () => {
  it("#95 AC 9: answers a group I do not belong to exactly as an id no group has", async () => {
    const { groupId, body, postExpense, expenseStore, signIn } = await world();
    const dee = await signIn("dee@example.com");

    const theirs = await postExpense(dee.token, groupId, body());
    const unknown = await postExpense(dee.token, randomUUID(), body());

    expect(theirs.statusCode).toBe(404);
    expect(errorResponseSchema.parse(theirs.json())).toEqual({ error: "not_found" });
    expect(unknown.statusCode).toBe(theirs.statusCode);
    expect(unknown.body).toBe(theirs.body);
    expect(await expenseStore.listExpenses(groupId)).toEqual([]);
  });

  it("#95 AC 9: answers a non-member with an invalid body as an unknown id too, not 400", async () => {
    const { groupId, postExpense, expenseStore, signIn } = await world();
    const dee = await signIn("dee@example.com");

    const theirs = await postExpense(dee.token, groupId, { amount: 0 });
    const unknown = await postExpense(dee.token, randomUUID(), { amount: 0 });

    expect(theirs.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(unknown.body).toBe(theirs.body);
    expect(await expenseStore.listExpenses(groupId)).toEqual([]);
  });

  it("#95 AC 9: does not let a non-member be named as the payer or in the split", async () => {
    const { ana, groupId, body, postExpense, expenseStore, signIn } = await world();
    const dee = await signIn("dee@example.com");

    const res = await postExpense(ana.token, groupId, body({ payerId: dee.id }));

    expect(res.statusCode).toBe(400);
    expect(await expenseStore.listExpenses(groupId)).toEqual([]);
  });

  describe("#95 AC 10: answers 401 without a live session, and stores nothing", () => {
    async function tokens() {
      const app = setup();
      const expired = await app.signIn("old@example.com");
      app.advance(SESSION_TTL_MS);
      const ana = await app.signIn("ana@example.com");
      const groupId = await app.createGroup(ana.token);
      return {
        app,
        groupId,
        cases: [
          ["no token", undefined],
          ["a wrong token", "made-up-token"],
          ["an expired token", expired.token],
        ] as const,
      };
    }

    it("on POST /groups/:id/expenses", async () => {
      const { app, groupId, cases } = await tokens();
      for (const [label, token] of cases) {
        const res = await app.postExpense(token, groupId, {
          payerId: randomUUID(),
          amount: 1000,
          description: "Trộm",
          splitBetween: [randomUUID()],
        });
        expect(res.statusCode, label).toBe(401);
        expect(res.json(), label).toEqual({ error: "unauthorized" });
      }
      expect(await app.expenseStore.listExpenses(groupId)).toEqual([]);
    });

    it("checks the session before the body", async () => {
      const { app, groupId } = await tokens();

      const res = await app.postExpense(undefined, groupId, { amount: 0 });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("#95 AC 11: answers 404 not_found for a group id that is not an id", () => {
    it("on the in-memory stores", async () => {
      const { ana, body, postExpense } = await world();

      const res = await postExpense(ana.token, "not-a-uuid", body());

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    });

    it("on Postgres too, which rejects non-UUIDs", async () => {
      const testDb = await createTestDb();
      try {
        const { signIn, postExpense } = setup({
          groupStore: createPostgresGroupStore(testDb.database.db),
          expenseStore: createPostgresExpenseStore(testDb.database.db),
        });
        const ana = await signIn("ana@example.com");

        const res = await postExpense(ana.token, "not-a-uuid", {
          payerId: randomUUID(),
          amount: 1000,
          description: "x",
          splitBetween: [randomUUID()],
        } satisfies CreateExpenseBody);

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: "not_found" });
      } finally {
        await testDb.drop();
      }
    });
  });
});
