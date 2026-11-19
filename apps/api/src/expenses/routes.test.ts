import { randomUUID } from "node:crypto";
import {
  balancesResponseSchema,
  type CreateExpenseBody,
  errorResponseSchema,
  expenseListResponseSchema,
  expenseResponseSchema,
  groupResponseSchema,
  meResponseSchema,
  SESSION_TTL_MS,
  settlementResponseSchema,
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
    getBalances(token: string | undefined, groupId: string) {
      return app.inject({
        method: "GET",
        url: `/groups/${groupId}/balances`,
        headers: bearer(token),
      });
    },
    listExpenses(token: string | undefined, groupId: string) {
      return app.inject({
        method: "GET",
        url: `/groups/${groupId}/expenses`,
        headers: bearer(token),
      });
    },
    deleteExpense(token: string | undefined, groupId: string, expenseId: string) {
      return app.inject({
        method: "DELETE",
        url: `/groups/${groupId}/expenses/${expenseId}`,
        headers: bearer(token),
      });
    },
    postSettlement(token: string | undefined, groupId: string, payload?: unknown) {
      return app.inject({
        method: "POST",
        url: `/groups/${groupId}/settlements`,
        headers: bearer(token),
        payload: payload as Record<string, unknown> | undefined,
      });
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
 * `addMember`, which sets the join time a test needs. `tie` makes Bao and Cy join at the same moment.
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

describe("GET /groups/:id/expenses", () => {
  it("#95 AC 4: lists a group's expenses newest first with their shares, and no other group's", async () => {
    const { ana, bao, cy, groupId, body, postExpense, listExpenses, createGroup, advance } =
      await world();
    const older = expenseResponseSchema.parse(
      (await postExpense(ana.token, groupId, body({ description: "Cũ" }))).json(),
    );
    advance(minute);
    const newer = expenseResponseSchema.parse(
      (
        await postExpense(
          bao.token,
          groupId,
          body({ payerId: bao.id, amount: 100_000, description: "Mới" }),
        )
      ).json(),
    );
    const otherGroupId = await createGroup(ana.token);
    await postExpense(ana.token, otherGroupId, {
      payerId: ana.id,
      amount: 5_000,
      description: "Nhóm khác",
      splitBetween: [ana.id],
    });

    const res = await listExpenses(cy.token, groupId);

    expect(res.statusCode).toBe(200);
    expect(expenseListResponseSchema.parse(res.json())).toEqual({ expenses: [newer, older] });
    expect(newer.createdAt).toBe("2026-11-06T10:01:00.000Z");
    expect(newer.shares).toHaveLength(3);
    expect(older.createdAt).toBe("2026-11-06T10:00:00.000Z");
  });

  it("#95 A5: lists two expenses added at the same moment in one stable order", async () => {
    const { ana, groupId, body, postExpense, listExpenses } = await world();
    const first = expenseResponseSchema.parse(
      (await postExpense(ana.token, groupId, body({ description: "Một" }))).json(),
    );
    const second = expenseResponseSchema.parse(
      (await postExpense(ana.token, groupId, body({ description: "Hai" }))).json(),
    );

    const expected = [first, second].sort((x, y) => (x.id < y.id ? 1 : -1));
    for (let times = 0; times < 3; times++) {
      expect(
        expenseListResponseSchema.parse((await listExpenses(ana.token, groupId)).json()),
      ).toEqual({ expenses: expected });
    }
  });

  it("#95 AC 5: answers 200 with an empty list for a group with no expenses", async () => {
    const { ana, groupId, listExpenses } = await world();

    const res = await listExpenses(ana.token, groupId);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ expenses: [] });
  });
});

describe("GET /groups/:id/balances", () => {
  it("#96 AC 1: shows Ana +50000 and Bao -50000 after Ana adds 100000 split between them", async () => {
    const { ana, bao, cy, groupId, body, postExpense, getBalances } = await world();
    await postExpense(
      ana.token,
      groupId,
      body({ amount: 100_000, splitBetween: [ana.id, bao.id] }),
    );

    const res = await getBalances(bao.token, groupId);

    expect(res.statusCode).toBe(200);
    const parsed = balancesResponseSchema.parse(res.json());
    expect(
      Object.fromEntries(parsed.balances.map((entry) => [entry.userId, entry.balance])),
    ).toEqual({ [ana.id]: 50_000, [bao.id]: -50_000, [cy.id]: 0 });
    expect(parsed.suggestions).toEqual([{ from: bao.id, to: ana.id, amount: 50_000 }]);
  });

  it("#96 AC 2, 3: adds up to 0 over several expenses, and the suggestion settles them", async () => {
    const { ana, bao, cy, groupId, body, postExpense, getBalances } = await world();
    await postExpense(ana.token, groupId, body());
    await postExpense(
      bao.token,
      groupId,
      body({ payerId: bao.id, amount: 60_000, splitBetween: [ana.id, bao.id] }),
    );
    await postExpense(
      cy.token,
      groupId,
      body({ payerId: cy.id, amount: 100_000, splitBetween: [ana.id] }),
    );

    const parsed = balancesResponseSchema.parse((await getBalances(ana.token, groupId)).json());

    const balance = Object.fromEntries(
      parsed.balances.map((entry) => [entry.userId, entry.balance]),
    );
    expect(balance).toEqual({ [ana.id]: -70_000, [bao.id]: 0, [cy.id]: 70_000 });
    expect(parsed.balances.reduce((sum, entry) => sum + entry.balance, 0)).toBe(0);
    expect(parsed.suggestions).toEqual([{ from: ana.id, to: cy.id, amount: 70_000 }]);
  });

  it("#96 AC 4, A1: shows every member at 0 and no suggestions for a group with no expenses", async () => {
    const { ana, bao, cy, groupId, getBalances } = await world();

    const res = await getBalances(cy.token, groupId);

    expect(res.statusCode).toBe(200);
    expect(balancesResponseSchema.parse(res.json())).toEqual({
      balances: [ana.id, bao.id, cy.id].sort().map((userId) => ({ userId, balance: 0 })),
      suggestions: [],
    });
  });

  it("#96 A1: lists a member who took no part in any expense, and orders members by id", async () => {
    const { ana, bao, cy, groupId, body, postExpense, getBalances } = await world();
    await postExpense(ana.token, groupId, body({ splitBetween: [ana.id, bao.id] }));

    const parsed = balancesResponseSchema.parse((await getBalances(ana.token, groupId)).json());

    expect(parsed.balances.map((entry) => entry.userId)).toEqual([ana.id, bao.id, cy.id].sort());
    expect(parsed.balances.find((entry) => entry.userId === cy.id)?.balance).toBe(0);
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

  it("#95 AC 9: answers a non-member's list exactly as an id no group has, showing no expense", async () => {
    const { ana, groupId, body, postExpense, listExpenses, signIn } = await world();
    await postExpense(ana.token, groupId, body({ description: "Riêng tư" }));
    const dee = await signIn("dee@example.com");

    const theirs = await listExpenses(dee.token, groupId);
    const unknown = await listExpenses(dee.token, randomUUID());

    expect(theirs.statusCode).toBe(404);
    expect(errorResponseSchema.parse(theirs.json())).toEqual({ error: "not_found" });
    expect(unknown.statusCode).toBe(theirs.statusCode);
    expect(unknown.body).toBe(theirs.body);
    expect(theirs.body).not.toContain("Riêng tư");
  });

  it("#95 AC 9: does not let a non-member be named as the payer or in the split", async () => {
    const { ana, groupId, body, postExpense, expenseStore, signIn } = await world();
    const dee = await signIn("dee@example.com");

    const res = await postExpense(ana.token, groupId, body({ payerId: dee.id }));

    expect(res.statusCode).toBe(400);
    expect(await expenseStore.listExpenses(groupId)).toEqual([]);
  });

  it("#96 AC 5: answers a non-member's balances exactly as an id no group has, naming no member", async () => {
    const { ana, bao, cy, groupId, body, postExpense, getBalances, signIn } = await world();
    await postExpense(ana.token, groupId, body());
    const dee = await signIn("dee@example.com");

    const theirs = await getBalances(dee.token, groupId);
    const unknown = await getBalances(dee.token, randomUUID());

    expect(theirs.statusCode).toBe(404);
    expect(errorResponseSchema.parse(theirs.json())).toEqual({ error: "not_found" });
    expect(unknown.statusCode).toBe(theirs.statusCode);
    expect(unknown.body).toBe(theirs.body);
    for (const member of [ana, bao, cy]) {
      expect(theirs.body).not.toContain(member.id);
    }
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

    it("on GET /groups/:id/expenses", async () => {
      const { app, groupId, cases } = await tokens();
      for (const [label, token] of cases) {
        const res = await app.listExpenses(token, groupId);
        expect(res.statusCode, label).toBe(401);
        expect(res.json(), label).toEqual({ error: "unauthorized" });
      }
    });

    it("on GET /groups/:id/balances (#96 AC 6)", async () => {
      const { app, groupId, cases } = await tokens();
      for (const [label, token] of cases) {
        const res = await app.getBalances(token, groupId);
        expect(res.statusCode, label).toBe(401);
        expect(res.json(), label).toEqual({ error: "unauthorized" });
      }
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

    it("on the in-memory stores, for the list too", async () => {
      const { ana, listExpenses } = await world();

      const res = await listExpenses(ana.token, "not-a-uuid");

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    });

    it("#96 AC 7: on the in-memory stores, for the balances too", async () => {
      const { ana, getBalances } = await world();

      const res = await getBalances(ana.token, "not-a-uuid");

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    });

    it("on Postgres too, which rejects non-UUIDs", async () => {
      const testDb = await createTestDb();
      try {
        const { signIn, postExpense, listExpenses, getBalances } = setup({
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
        const list = await listExpenses(ana.token, "not-a-uuid");
        expect(list.statusCode).toBe(404);
        expect(list.json()).toEqual({ error: "not_found" });
        const balances = await getBalances(ana.token, "not-a-uuid");
        expect(balances.statusCode).toBe(404);
        expect(balances.json()).toEqual({ error: "not_found" });
      } finally {
        await testDb.drop();
      }
    });
  });
});

describe("DELETE /groups/:id/expenses/:expenseId", () => {
  /** Ana's group with one expense Ana paid. */
  async function withExpense() {
    const w = await world();
    const created = await w.postExpense(w.ana.token, w.groupId, w.body({ amount: 100_000 }));
    const expense = expenseResponseSchema.parse(created.json());
    return { ...w, expense };
  }
  const listed = async (w: Awaited<ReturnType<typeof withExpense>>, groupId = w.groupId) =>
    expenseListResponseSchema.parse((await w.listExpenses(w.ana.token, groupId)).json()).expenses;

  it("#145 AC 1: answers 204 with no body to the payer, and the store no longer holds it", async () => {
    const w = await withExpense();

    const res = await w.deleteExpense(w.ana.token, w.groupId, w.expense.id);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(await w.expenseStore.listExpenses(w.groupId)).toEqual([]);
  });

  it("#145 AC 2: leaves the list without it and the balances at 0 with no suggestions", async () => {
    const w = await withExpense();

    await w.deleteExpense(w.ana.token, w.groupId, w.expense.id);

    expect(await listed(w)).toEqual([]);
    const balances = balancesResponseSchema.parse(
      (await w.getBalances(w.bao.token, w.groupId)).json(),
    );
    expect(balances.suggestions).toEqual([]);
    expect(balances.balances.every((b) => b.balance === 0)).toBe(true);
  });

  it("#145 AC 2: with two expenses, only the deleted one stops counting", async () => {
    const w = await withExpense();
    const second = expenseResponseSchema.parse(
      (
        await w.postExpense(
          w.ana.token,
          w.groupId,
          w.body({ amount: 60_000, splitBetween: [w.ana.id, w.bao.id] }),
        )
      ).json(),
    );

    await w.deleteExpense(w.ana.token, w.groupId, w.expense.id);

    expect((await listed(w)).map((e) => e.id)).toEqual([second.id]);
    const balances = balancesResponseSchema.parse(
      (await w.getBalances(w.ana.token, w.groupId)).json(),
    );
    expect(Object.fromEntries(balances.balances.map((b) => [b.userId, b.balance]))).toEqual({
      [w.ana.id]: 30_000,
      [w.bao.id]: -30_000,
      [w.cy.id]: 0,
    });
  });

  it("#145 AC 3: answers 403 forbidden to another member, and the expense still counts", async () => {
    const w = await withExpense();

    const res = await w.deleteExpense(w.bao.token, w.groupId, w.expense.id);

    expect(res.statusCode).toBe(403);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "forbidden" });
    expect((await listed(w)).map((e) => e.id)).toEqual([w.expense.id]);
    const balances = balancesResponseSchema.parse(
      (await w.getBalances(w.ana.token, w.groupId)).json(),
    );
    expect(balances.suggestions).not.toEqual([]);
  });

  it("#145 AC 4: answers a non-member, an unknown group and a malformed group id with one 404", async () => {
    const w = await withExpense();
    const dee = await w.signIn("dee@example.com");

    const theirs = await w.deleteExpense(dee.token, w.groupId, w.expense.id);
    const unknown = await w.deleteExpense(dee.token, randomUUID(), w.expense.id);
    const malformed = await w.deleteExpense(dee.token, "not-an-id", w.expense.id);

    expect(theirs.statusCode).toBe(404);
    expect(errorResponseSchema.parse(theirs.json())).toEqual({ error: "not_found" });
    expect(unknown.body).toBe(theirs.body);
    expect(malformed.statusCode).toBe(404);
    expect(malformed.body).toBe(theirs.body);
    expect((await listed(w)).map((e) => e.id)).toEqual([w.expense.id]);
  });

  it("#145 AC 5: answers a member's unknown, malformed, other-group and deleted expense id with 404 not_found", async () => {
    const w = await withExpense();
    const otherGroup = await w.createGroup(w.ana.token);
    const other = expenseResponseSchema.parse(
      (
        await w.postExpense(w.ana.token, otherGroup, {
          payerId: w.ana.id,
          amount: 5000,
          description: "Khác",
          splitBetween: [w.ana.id],
        })
      ).json(),
    );
    const gone = await w.postExpense(w.ana.token, w.groupId, w.body());
    const goneId = expenseResponseSchema.parse(gone.json()).id;
    await w.deleteExpense(w.ana.token, w.groupId, goneId);

    const cases = [
      ["unknown", randomUUID()],
      ["malformed", "not-an-id"],
      ["another group's", other.id],
      ["already deleted", goneId],
    ] as const;
    for (const [label, id] of cases) {
      const res = await w.deleteExpense(w.ana.token, w.groupId, id);
      expect(res.statusCode, label).toBe(404);
      expect(res.json(), label).toEqual({ error: "not_found" });
    }
    expect((await listed(w, otherGroup)).map((e) => e.id)).toEqual([other.id]);
    expect((await listed(w)).map((e) => e.id)).toEqual([w.expense.id]);
  });

  it("#145 AC 6: answers 401 to no, an unknown and an ended session, and deletes nothing", async () => {
    const app = setup();
    const expired = await app.signIn("old@example.com");
    app.advance(SESSION_TTL_MS);
    const ana = await app.signIn("ana@example.com");
    const groupId = await app.createGroup(ana.token);
    const created = await app.postExpense(ana.token, groupId, {
      payerId: ana.id,
      amount: 1000,
      description: "Giữ",
      splitBetween: [ana.id],
    });
    const id = expenseResponseSchema.parse(created.json()).id;

    for (const [label, token] of [
      ["no token", undefined],
      ["a wrong token", "made-up-token"],
      ["an expired token", expired.token],
    ] as const) {
      const res = await app.deleteExpense(token, groupId, id);
      expect(res.statusCode, label).toBe(401);
      expect(res.json(), label).toEqual({ error: "unauthorized" });
    }
    expect((await app.expenseStore.listExpenses(groupId)).map((e) => e.id)).toEqual([id]);
  });

  it("#145 A5: answers a non-member on a real expense 404 not 403, and a member's wrong id 404 not 403", async () => {
    const w = await withExpense();
    const dee = await w.signIn("dee@example.com");

    expect((await w.deleteExpense(dee.token, w.groupId, w.expense.id)).statusCode).toBe(404);
    expect((await w.deleteExpense(w.bao.token, w.groupId, randomUUID())).statusCode).toBe(404);
  });

  it("#145 A6: answers a second DELETE of the same expense 404", async () => {
    const w = await withExpense();

    expect((await w.deleteExpense(w.ana.token, w.groupId, w.expense.id)).statusCode).toBe(204);
    const again = await w.deleteExpense(w.ana.token, w.groupId, w.expense.id);

    expect(again.statusCode).toBe(404);
    expect(again.json()).toEqual({ error: "not_found" });
  });
});

describe("POST /groups/:id/settlements", () => {
  /** Ana paid 90000 for the three: Bao and Cy each owe her 30000. */
  async function owing() {
    const w = await world();
    const res = await w.postExpense(w.ana.token, w.groupId, w.body());
    expect(res.statusCode).toBe(201);
    const pay = (overrides: Record<string, unknown> = {}) => ({
      payerId: w.bao.id,
      payeeId: w.ana.id,
      amount: 30_000,
      ...overrides,
    });
    const stored = () => w.expenseStore.listSettlements(w.groupId);
    return { ...w, pay, stored };
  }

  it("#148 AC 2: answers 201 and stores the payer, payee, amount and group", async () => {
    const { bao, ana, groupId, pay, postSettlement, stored } = await owing();

    const res = await postSettlement(bao.token, groupId, pay());

    expect(res.statusCode).toBe(201);
    const parsed = settlementResponseSchema.parse(res.json());
    expect(parsed).toMatchObject({ groupId, payerId: bao.id, payeeId: ana.id, amount: 30_000 });
    expect(await stored()).toEqual([
      expect.objectContaining({ id: parsed.id, groupId, payerId: bao.id, amount: 30_000 }),
    ]);
  });

  it("#148 AC 3, 4: then the balances route shows 0 for the settled pair and no payment for them", async () => {
    const { ana, bao, cy, groupId, pay, postSettlement, getBalances } = await owing();

    await postSettlement(bao.token, groupId, pay());

    const parsed = balancesResponseSchema.parse((await getBalances(bao.token, groupId)).json());
    expect(
      Object.fromEntries(parsed.balances.map((entry) => [entry.userId, entry.balance])),
    ).toEqual({ [ana.id]: 30_000, [bao.id]: 0, [cy.id]: -30_000 });
    expect(parsed.suggestions).toEqual([{ from: cy.id, to: ana.id, amount: 30_000 }]);
  });

  it("#148 A3: stores an amount that differs from the suggestion", async () => {
    const { bao, groupId, pay, postSettlement, stored } = await owing();

    const res = await postSettlement(bao.token, groupId, pay({ amount: 10_000 }));

    expect(res.statusCode).toBe(201);
    expect(await stored()).toEqual([expect.objectContaining({ amount: 10_000 })]);
  });

  it.each([0, -5, 1.5])(
    "#148 AC 6: answers 400 and stores nothing for the amount %s",
    async (amount) => {
      const { bao, groupId, pay, postSettlement, stored } = await owing();
      expect((await postSettlement(bao.token, groupId, pay())).statusCode).toBe(201);

      const res = await postSettlement(bao.token, groupId, pay({ amount }));

      expect(res.statusCode).toBe(400);
      expect(errorResponseSchema.parse(res.json())).toEqual({ error: "invalid_request" });
      expect(await stored()).toHaveLength(1);
    },
  );

  it("#148 AC 7: answers 400 and stores nothing when payer and payee are the same member", async () => {
    const { bao, groupId, pay, postSettlement, stored } = await owing();

    const res = await postSettlement(bao.token, groupId, pay({ payeeId: bao.id }));

    expect(res.statusCode).toBe(400);
    expect(await stored()).toEqual([]);
  });

  it("#148 AC 8: answers 401 and stores nothing without a session", async () => {
    const { bao, groupId, pay, postSettlement, stored } = await owing();
    expect((await postSettlement(bao.token, groupId, pay())).statusCode).toBe(201);

    const res = await postSettlement(undefined, groupId, pay());
    const unknown = await postSettlement("not-a-token", groupId, pay());

    expect(res.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "unauthorized" });
    expect(await stored()).toHaveLength(1);
  });

  it("#148 AC 8: answers 401 and stores nothing for an ended session", async () => {
    const { bao, groupId, pay, postSettlement, stored, advance } = await owing();
    expect((await postSettlement(bao.token, groupId, pay())).statusCode).toBe(201);
    advance(SESSION_TTL_MS + minute);

    const res = await postSettlement(bao.token, groupId, pay());

    expect(res.statusCode).toBe(401);
    expect(await stored()).toHaveLength(1);
  });

  it("#148 AC 9: answers 404 and stores nothing for a user who is not in the group", async () => {
    const { bao, groupId, pay, postSettlement, signIn, stored } = await owing();
    expect((await postSettlement(bao.token, groupId, pay())).statusCode).toBe(201);
    const outsider = await signIn("out@example.com");

    const res = await postSettlement(outsider.token, groupId, pay());
    const unknown = await postSettlement(bao.token, randomUUID(), pay());
    const malformed = await postSettlement(bao.token, "not-an-id", pay());

    expect(res.statusCode).toBe(404);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "not_found" });
    expect(unknown.statusCode).toBe(404);
    expect(malformed.statusCode).toBe(404);
    expect(res.json()).toEqual(unknown.json());
    expect(await stored()).toHaveLength(1);
  });

  it("#148 AC 10: answers 400 and stores nothing when the payee is not a member", async () => {
    const { bao, groupId, pay, postSettlement, signIn, stored } = await owing();
    const outsider = await signIn("out@example.com");

    const res = await postSettlement(bao.token, groupId, pay({ payeeId: outsider.id }));

    expect(res.statusCode).toBe(400);
    expect(await stored()).toEqual([]);
  });

  it("#148 AC 10: answers 400 and stores nothing when the payer is not a member", async () => {
    const { bao, groupId, pay, postSettlement, signIn, stored } = await owing();
    const outsider = await signIn("out@example.com");

    const res = await postSettlement(bao.token, groupId, pay({ payerId: outsider.id }));

    expect(res.statusCode).toBe(400);
    expect(await stored()).toEqual([]);
  });

  it("#148 AC 14: answers 403 and stores nothing when the payer is another member", async () => {
    const { ana, bao, cy, groupId, pay, postSettlement, stored } = await owing();
    expect((await postSettlement(bao.token, groupId, pay())).statusCode).toBe(201);

    const res = await postSettlement(ana.token, groupId, pay({ payerId: cy.id }));

    expect(res.statusCode).toBe(403);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "forbidden" });
    expect(await stored()).toHaveLength(1);
  });
});
