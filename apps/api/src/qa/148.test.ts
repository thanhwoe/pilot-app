// #148 QA: black-box tests from the spec only. `// QA guess:` marks a name the spec doesn't give.
import { randomUUID } from "node:crypto";
import {
  balancesResponseSchema,
  groupResponseSchema,
  meResponseSchema,
  signInResponseSchema,
} from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryAuthStore } from "../auth/memory-store";
import { createMemoryExpenseStore } from "../expenses/memory-store";
import { createMemoryGroupStore } from "../groups/memory-store";

const authSecret = "test-secret-that-is-at-least-32-characters";
const t0 = new Date("2026-11-19T10:00:00Z");

async function world() {
  const groupStore = createMemoryGroupStore();
  const expenseStore = createMemoryExpenseStore();
  const sent: { email: string; code: string }[] = [];
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
    now: () => t0,
  });
  const bearer = (token?: string) => (token ? { authorization: `Bearer ${token}` } : {});
  const signIn = async (email: string) => {
    await app.inject({ method: "POST", url: "/auth/code", payload: { email } });
    const res = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email, code: sent.at(-1)?.code },
    });
    const { token } = signInResponseSchema.parse(res.json());
    const me = await app.inject({ method: "GET", url: "/me", headers: bearer(token) });
    return { token, id: meResponseSchema.parse(me.json()).id };
  };
  const ana = await signIn("ana@example.com");
  const bao = await signIn("bao@example.com");
  const outsider = await signIn("out@example.com");
  const created = await app.inject({
    method: "POST",
    url: "/groups",
    headers: bearer(ana.token),
    payload: { name: "Chuyến đi" },
  });
  const groupId = groupResponseSchema.parse(created.json()).id;
  (groupStore as ReturnType<typeof createMemoryGroupStore>).addMember(
    groupId,
    bao.id,
    new Date(t0.getTime() + 60_000),
  );
  // Ana pays 40000 split between Ana and Bao: Bao owes Ana 20000.
  const expense = await app.inject({
    method: "POST",
    url: `/groups/${groupId}/expenses`,
    headers: bearer(ana.token),
    payload: {
      payerId: ana.id,
      amount: 40_000,
      description: "Ăn tối",
      splitBetween: [ana.id, bao.id],
    },
  });
  expect(expense.statusCode).toBe(201);

  return {
    ana,
    bao,
    outsider,
    groupId,
    // QA guess: body fields payerId, payeeId, amount; route POST /groups/:id/settlements (spec).
    settle: (token: string | undefined, id: string, payload?: unknown) =>
      app.inject({
        method: "POST",
        url: `/groups/${id}/settlements`,
        headers: bearer(token),
        payload: payload as Record<string, unknown> | undefined,
      }),
    balances: async (token: string) =>
      balancesResponseSchema.parse(
        (
          await app.inject({
            method: "GET",
            url: `/groups/${groupId}/balances`,
            headers: bearer(token),
          })
        ).json(),
      ),
  };
}

const byUser = (r: { balances: { userId: string; balance: number }[] }) =>
  Object.fromEntries(r.balances.map((e) => [e.userId, e.balance]));

describe("POST /groups/:id/settlements", () => {
  it("#148 QA AC 2: answers 201 and records payer, payee, 20000 in that group", async () => {
    const { ana, bao, groupId, settle, balances } = await world();

    const res = await settle(bao.token, groupId, {
      payerId: bao.id,
      payeeId: ana.id,
      amount: 20_000,
    });

    expect(res.statusCode).toBe(201);
    // Stored: seen from outside as the balances moving by exactly that payment.
    expect(byUser(await balances(ana.token))).toEqual({ [ana.id]: 0, [bao.id]: 0 });
  });

  it("#148 QA AC 4: settling the only debt leaves 0 balances and no suggestions", async () => {
    const { ana, bao, groupId, settle, balances } = await world();
    await settle(bao.token, groupId, { payerId: bao.id, payeeId: ana.id, amount: 20_000 });

    const after = await balances(bao.token);

    expect(byUser(after)).toEqual({ [ana.id]: 0, [bao.id]: 0 });
    expect(after.suggestions).toEqual([]);
  });

  it("#148 QA AC 5: payer's balance rises, payee's falls by the same amount, sum stays 0", async () => {
    const { ana, bao, groupId, settle, balances } = await world();
    await settle(bao.token, groupId, { payerId: bao.id, payeeId: ana.id, amount: 5_000 });

    const after = await balances(ana.token);

    expect(byUser(after)).toEqual({ [ana.id]: 15_000, [bao.id]: -15_000 });
    expect(after.balances.reduce((s, e) => s + e.balance, 0)).toBe(0);
  });

  it.each([0, -5, 1.5])("#148 QA AC 6: amount %s gives 400 and stores nothing", async (amount) => {
    const { ana, bao, groupId, settle, balances } = await world();

    const res = await settle(bao.token, groupId, { payerId: bao.id, payeeId: ana.id, amount });

    expect(res.statusCode).toBe(400);
    expect(byUser(await balances(ana.token))).toEqual({ [ana.id]: 20_000, [bao.id]: -20_000 });
  });

  it("#148 QA AC 7: payer equal to payee gives 400 and stores nothing", async () => {
    const { ana, bao, groupId, settle, balances } = await world();

    const res = await settle(bao.token, groupId, {
      payerId: bao.id,
      payeeId: bao.id,
      amount: 20_000,
    });

    expect(res.statusCode).toBe(400);
    expect(byUser(await balances(ana.token))).toEqual({ [ana.id]: 20_000, [bao.id]: -20_000 });
  });

  it("#148 QA AC 8: no session gives 401 and stores nothing", async () => {
    const { ana, bao, groupId, settle, balances } = await world();

    const res = await settle(undefined, groupId, {
      payerId: bao.id,
      payeeId: ana.id,
      amount: 20_000,
    });

    expect(res.statusCode).toBe(401);
    expect(byUser(await balances(ana.token))).toEqual({ [ana.id]: 20_000, [bao.id]: -20_000 });
  });

  it("#148 QA AC 9: a non-member gets 404 and stores nothing", async () => {
    const { ana, bao, outsider, groupId, settle, balances } = await world();

    const res = await settle(outsider.token, groupId, {
      payerId: outsider.id,
      payeeId: ana.id,
      amount: 20_000,
    });

    expect(res.statusCode).toBe(404);
    expect(byUser(await balances(ana.token))).toEqual({ [ana.id]: 20_000, [bao.id]: -20_000 });
  });

  it("#148 QA AC 10: a payee who is not a member gives 400 and stores nothing", async () => {
    const { ana, bao, outsider, groupId, settle, balances } = await world();

    const res = await settle(bao.token, groupId, {
      payerId: bao.id,
      payeeId: outsider.id,
      amount: 20_000,
    });

    expect(res.statusCode).toBe(400);
    expect(byUser(await balances(ana.token))).toEqual({ [ana.id]: 20_000, [bao.id]: -20_000 });
  });

  it("#148 QA AC 10: a payer who is not a member gives 400 and stores nothing", async () => {
    // The spec orders 400 (body) before 403 (payer ≠ caller), so a non-member payer is 400.
    const { ana, bao, groupId, outsider, settle, balances } = await world();

    const res = await settle(ana.token, groupId, {
      payerId: outsider.id,
      payeeId: ana.id,
      amount: 20_000,
    });

    expect(res.statusCode).toBe(400);
    expect(byUser(await balances(ana.token))).toEqual({ [ana.id]: 20_000, [bao.id]: -20_000 });
  });

  it("#148 QA AC 14: a member naming another member as payer gets 403 and stores nothing", async () => {
    const { ana, bao, groupId, settle, balances } = await world();

    const res = await settle(ana.token, groupId, {
      payerId: bao.id,
      payeeId: ana.id,
      amount: 20_000,
    });

    expect(res.statusCode).toBe(403);
    expect(byUser(await balances(ana.token))).toEqual({ [ana.id]: 20_000, [bao.id]: -20_000 });
  });

  it("#148 QA A3: an amount different from the suggestion gets 201 and is stored", async () => {
    const { ana, bao, groupId, settle, balances } = await world();

    const res = await settle(bao.token, groupId, {
      payerId: bao.id,
      payeeId: ana.id,
      amount: 30_000,
    });

    expect(res.statusCode).toBe(201);
    expect(byUser(await balances(ana.token))).toEqual({ [ana.id]: -10_000, [bao.id]: 10_000 });
  });

  it("#148 QA AC 9: an unknown group gives 404", async () => {
    const { ana, bao, settle } = await world();

    const res = await settle(bao.token, randomUUID(), {
      payerId: bao.id,
      payeeId: ana.id,
      amount: 20_000,
    });

    expect(res.statusCode).toBe(404);
  });
});
