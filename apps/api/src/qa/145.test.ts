import { randomUUID } from "node:crypto";
import {
  balancesResponseSchema,
  errorResponseSchema,
  expenseListResponseSchema,
  expenseResponseSchema,
  groupResponseSchema,
  meResponseSchema,
  SESSION_TTL_MS,
  signInResponseSchema,
} from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryAuthStore } from "../auth/memory-store";
import { createMemoryExpenseStore } from "../expenses/memory-store";
import { createMemoryGroupStore } from "../groups/memory-store";

const authSecret = "test-secret-that-is-at-least-32-characters";
const minute = 60_000;
const t0 = new Date("2026-11-19T10:00:00Z");

/** QA's own black-box setup for #145: the app on in-memory stores, built from the spec only. */
async function world() {
  const groupStore = createMemoryGroupStore();
  const expenseStore = createMemoryExpenseStore();
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
  async function signIn(email: string) {
    await app.inject({ method: "POST", url: "/auth/code", payload: { email } });
    const res = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email, code: sent.at(-1)?.code },
    });
    const { token } = signInResponseSchema.parse(res.json());
    const me = await app.inject({ method: "GET", url: "/me", headers: bearer(token) });
    return { token, id: meResponseSchema.parse(me.json()).id };
  }
  async function createGroup(token: string) {
    const res = await app.inject({
      method: "POST",
      url: "/groups",
      headers: bearer(token),
      payload: { name: "Chuyến đi" },
    });
    return groupResponseSchema.parse(res.json()).id;
  }
  const a = await signIn("a@example.com");
  const b = await signIn("b@example.com");
  const outsider = await signIn("outsider@example.com");
  const groupId = await createGroup(a.token);
  groupStore.addMember(groupId, b.id, new Date(t0.getTime() + minute));

  const addExpense = async (
    token: string,
    gid: string,
    payerId: string,
    members: string[],
    amount = 100_000,
  ) => {
    const res = await app.inject({
      method: "POST",
      url: `/groups/${gid}/expenses`,
      headers: bearer(token),
      payload: { payerId, amount, description: "Ăn tối", splitBetween: members },
    });
    expect(res.statusCode).toBe(201);
    return expenseResponseSchema.parse(res.json()).id;
  };
  const del = (token: string | undefined, gid: string, expenseId: string) =>
    app.inject({
      method: "DELETE",
      url: `/groups/${gid}/expenses/${expenseId}`,
      headers: bearer(token),
    });
  const list = async (token: string, gid: string) => {
    const res = await app.inject({
      method: "GET",
      url: `/groups/${gid}/expenses`,
      headers: bearer(token),
    });
    return expenseListResponseSchema.parse(res.json()).expenses;
  };
  const balances = async (token: string, gid: string) => {
    const res = await app.inject({
      method: "GET",
      url: `/groups/${gid}/balances`,
      headers: bearer(token),
    });
    return balancesResponseSchema.parse(res.json());
  };

  return {
    app,
    a,
    b,
    outsider,
    groupId,
    groupStore,
    expenseStore,
    signIn,
    createGroup,
    addExpense,
    del,
    list,
    balances,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe("DELETE /groups/:id/expenses/:expenseId", () => {
  it("#145 QA AC 1: the payer's DELETE answers 204 with no body and the expense is gone", async () => {
    const w = await world();
    const id = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);

    const res = await w.del(w.a.token, w.groupId, id);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect((await w.list(w.a.token, w.groupId)).map((e) => e.id)).not.toContain(id);
    expect(await w.expenseStore.listExpenses(w.groupId)).toHaveLength(0);
  });

  it("#145 QA AC 2: after the delete the balances are 0 with no suggestions", async () => {
    const w = await world();
    const id = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);
    expect((await w.balances(w.b.token, w.groupId)).suggestions).toHaveLength(1);

    await w.del(w.a.token, w.groupId, id);

    expect(await w.list(w.b.token, w.groupId)).toEqual([]);
    const after = await w.balances(w.b.token, w.groupId);
    expect(after.suggestions).toEqual([]);
    expect(after.balances).toHaveLength(2);
    for (const entry of after.balances) expect(entry.balance).toBe(0);
  });

  it("#145 QA AC 2: with two expenses only the deleted one stops counting", async () => {
    const w = await world();
    const first = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id], 100_000);
    const second = await w.addExpense(w.b.token, w.groupId, w.b.id, [w.a.id, w.b.id], 40_000);

    await w.del(w.a.token, w.groupId, first);

    expect((await w.list(w.a.token, w.groupId)).map((e) => e.id)).toEqual([second]);
    const after = await w.balances(w.a.token, w.groupId);
    const byUser = Object.fromEntries(after.balances.map((e) => [e.userId, e.balance]));
    expect(byUser).toEqual({ [w.a.id]: -20_000, [w.b.id]: 20_000 });
    expect(after.suggestions).toEqual([{ from: w.a.id, to: w.b.id, amount: 20_000 }]);
  });

  it("#145 QA AC 3: another member's DELETE answers 403 forbidden and the expense still counts", async () => {
    const w = await world();
    const id = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);

    const res = await w.del(w.b.token, w.groupId, id);

    expect(res.statusCode).toBe(403);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "forbidden" });
    expect((await w.list(w.a.token, w.groupId)).map((e) => e.id)).toEqual([id]);
    const after = await w.balances(w.a.token, w.groupId);
    expect(after.suggestions).toEqual([{ from: w.b.id, to: w.a.id, amount: 50_000 }]);
  });

  it("#145 QA AC 4: a non-member, an unknown group and a malformed group id get the same 404 not_found", async () => {
    const w = await world();
    const id = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);

    const nonMember = await w.del(w.outsider.token, w.groupId, id);
    const unknown = await w.del(w.outsider.token, randomUUID(), id);
    const malformed = await w.del(w.outsider.token, "not-a-uuid", id);

    for (const res of [nonMember, unknown, malformed]) {
      expect(res.statusCode).toBe(404);
      expect(errorResponseSchema.parse(res.json())).toEqual({ error: "not_found" });
    }
    expect(nonMember.body).toBe(unknown.body);
    expect(nonMember.body).toBe(malformed.body);
    expect((await w.list(w.a.token, w.groupId)).map((e) => e.id)).toEqual([id]);
  });

  it("#145 QA AC 5: a member's DELETE of an unknown, malformed, other-group or already deleted id answers 404 not_found", async () => {
    const w = await world();
    const mine = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);
    const otherGroup = await w.createGroup(w.outsider.token);
    const foreign = await w.addExpense(w.outsider.token, otherGroup, w.outsider.id, [
      w.outsider.id,
    ]);
    const gone = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);
    expect((await w.del(w.a.token, w.groupId, gone)).statusCode).toBe(204);

    for (const expenseId of [randomUUID(), "not-a-uuid", foreign, gone]) {
      const res = await w.del(w.a.token, w.groupId, expenseId);
      expect(res.statusCode).toBe(404);
      expect(errorResponseSchema.parse(res.json())).toEqual({ error: "not_found" });
    }
    expect((await w.list(w.a.token, w.groupId)).map((e) => e.id)).toEqual([mine]);
    expect((await w.list(w.outsider.token, otherGroup)).map((e) => e.id)).toEqual([foreign]);
  });

  it("#145 QA AC 6: no, unknown and ended sessions get 401 unauthorized and nothing is deleted", async () => {
    const w = await world();
    const id = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);
    const ended = await w.signIn("ended@example.com");
    w.groupStore.addMember(w.groupId, ended.id, new Date(t0.getTime() + 2 * minute));
    // The other sessions are still alive after this; refresh them by signing in again.
    w.advance(SESSION_TTL_MS);
    const fresh = await w.signIn("fresh@example.com");
    w.groupStore.addMember(w.groupId, fresh.id, new Date(t0.getTime() + 3 * minute));

    const results = [
      await w.del(undefined, w.groupId, id),
      await w.del("unknown-session-token", w.groupId, id),
      await w.del(w.a.token, w.groupId, id), // ended: signed in before the TTL passed
    ];

    for (const res of results) {
      expect(res.statusCode).toBe(401);
      expect(errorResponseSchema.parse(res.json())).toEqual({ error: "unauthorized" });
    }
    expect((await w.list(fresh.token, w.groupId)).map((e) => e.id)).toEqual([id]);
  });

  it("#145 QA A5: a non-member on a real expense gets 404, not 403; a member with a wrong id gets 404, not 403", async () => {
    const w = await world();
    const id = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);

    const nonMember = await w.del(w.outsider.token, w.groupId, id);
    const wrongId = await w.del(w.b.token, w.groupId, randomUUID());

    expect(nonMember.statusCode).toBe(404);
    expect(wrongId.statusCode).toBe(404);
  });

  it("#145 QA A6: a second DELETE of the same expense answers 404", async () => {
    const w = await world();
    const id = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);

    expect((await w.del(w.a.token, w.groupId, id)).statusCode).toBe(204);
    const again = await w.del(w.a.token, w.groupId, id);

    expect(again.statusCode).toBe(404);
    expect(errorResponseSchema.parse(again.json())).toEqual({ error: "not_found" });
  });

  it("#145 QA A7: an expense paid by A but deleted by A leaves no share behind", async () => {
    const w = await world();
    const id = await w.addExpense(w.a.token, w.groupId, w.a.id, [w.a.id, w.b.id]);

    await w.del(w.a.token, w.groupId, id);

    const stored = await w.expenseStore.listExpenses(w.groupId);
    expect(stored.flatMap((e) => e.shares)).toEqual([]);
  });
});
