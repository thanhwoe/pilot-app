import {
  type BalancesResponse,
  computeBalances,
  createExpenseBodySchema,
  type ErrorResponse,
  type ExpenseListResponse,
  type ExpenseResponse,
  splitEqually,
  suggestSettlements,
} from "@gop/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createSessionCheck, type SessionDeps } from "../auth/session";
import type { GroupStore } from "../groups/store";
import type { ExpenseStore, StoredExpense } from "./store";

export interface ExpenseDeps extends SessionDeps {
  groupStore: GroupStore;
  expenseStore: ExpenseStore;
}

const invalidRequest: ErrorResponse = { error: "invalid_request" };
const unauthorized: ErrorResponse = { error: "unauthorized" };
/** One body for a group I'm not in, a group that doesn't exist and a malformed id. */
const notFound: ErrorResponse = { error: "not_found" };

const groupIdSchema = z.uuid();

function toResponse(expense: StoredExpense): ExpenseResponse {
  return { ...expense, createdAt: expense.createdAt.toISOString() };
}

export function registerExpenseRoutes(app: FastifyInstance, deps: ExpenseDeps) {
  const { groupStore, expenseStore, now } = deps;
  const findSession = createSessionCheck(deps);

  /** The group when the caller belongs to it; null for a malformed id, an unknown group or a non-member. */
  async function findGroup(userId: string, groupId: string) {
    const id = groupIdSchema.safeParse(groupId);
    return id.success ? groupStore.findGroupForMember(id.data, userId) : null;
  }

  // Checks run in this order: session (401), group and membership (404, so a non-member learns
  // nothing about the group), body (400), then that the payer and the split are members (400).
  app.post<{ Params: { id: string } }>("/groups/:id/expenses", async (request, reply) => {
    const session = await findSession(request);
    if (!session) {
      return reply.code(401).send(unauthorized);
    }
    const group = await findGroup(session.user.id, request.params.id);
    if (!group) {
      return reply.code(404).send(notFound);
    }
    const body = createExpenseBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(invalidRequest);
    }
    const { payerId, amount, description, splitBetween } = body.data;

    const members = await groupStore.listMembers(group.id);
    const memberIds = new Set(members.map((member) => member.userId));
    if (!memberIds.has(payerId) || !splitBetween.every((userId) => memberIds.has(userId))) {
      return reply.code(400).send(invalidRequest);
    }
    const shares = splitEqually({
      amount,
      payerId,
      members: members.filter((member) => splitBetween.includes(member.userId)),
    });

    const expense = await expenseStore.addExpense({
      groupId: group.id,
      payerId,
      amount,
      description,
      shares,
      now: now(),
    });
    return reply.code(201).send(toResponse(expense));
  });

  app.get<{ Params: { id: string } }>("/groups/:id/expenses", async (request, reply) => {
    const session = await findSession(request);
    if (!session) {
      return reply.code(401).send(unauthorized);
    }
    const group = await findGroup(session.user.id, request.params.id);
    if (!group) {
      return reply.code(404).send(notFound);
    }
    const expenses = await expenseStore.listExpenses(group.id);
    const response: ExpenseListResponse = { expenses: expenses.map(toResponse) };
    return response;
  });

  // The same two checks as the list: session (401), then group and membership (404).
  app.get<{ Params: { id: string } }>("/groups/:id/balances", async (request, reply) => {
    const session = await findSession(request);
    if (!session) {
      return reply.code(401).send(unauthorized);
    }
    const group = await findGroup(session.user.id, request.params.id);
    if (!group) {
      return reply.code(404).send(notFound);
    }
    const [members, expenses] = await Promise.all([
      groupStore.listMembers(group.id),
      expenseStore.listExpenses(group.id),
    ]);
    const balances = computeBalances(
      members.map((member) => member.userId),
      expenses,
    );
    const response: BalancesResponse = { balances, suggestions: suggestSettlements(balances) };
    return response;
  });
}
