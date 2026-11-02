import {
  createGroupBodySchema,
  type ErrorResponse,
  type GroupListResponse,
  type GroupResponse,
} from "@gop/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createSessionCheck, type SessionDeps } from "../auth/session";
import type { GroupStore, StoredGroup } from "./store";

export interface GroupDeps extends SessionDeps {
  groupStore: GroupStore;
}

const invalidRequest: ErrorResponse = { error: "invalid_request" };
const unauthorized: ErrorResponse = { error: "unauthorized" };
/** One body for a group I'm not in, a group that doesn't exist and a malformed id. */
const notFound: ErrorResponse = { error: "not_found" };

const groupIdSchema = z.uuid();

function toResponse(group: StoredGroup): GroupResponse {
  return { ...group, createdAt: group.createdAt.toISOString() };
}

export function registerGroupRoutes(app: FastifyInstance, deps: GroupDeps) {
  const { groupStore, now } = deps;
  const findSession = createSessionCheck(deps);

  app.post("/groups", async (request, reply) => {
    const session = await findSession(request);
    if (!session) {
      return reply.code(401).send(unauthorized);
    }
    const body = createGroupBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(invalidRequest);
    }
    const group = await groupStore.createGroup({
      name: body.data.name,
      creatorId: session.user.id,
      now: now(),
    });
    return reply.code(201).send(toResponse(group));
  });

  app.get("/groups", async (request, reply) => {
    const session = await findSession(request);
    if (!session) {
      return reply.code(401).send(unauthorized);
    }
    const groups = await groupStore.listGroupsForMember(session.user.id);
    const response: GroupListResponse = { groups: groups.map(toResponse) };
    return response;
  });

  app.get<{ Params: { id: string } }>("/groups/:id", async (request, reply) => {
    const session = await findSession(request);
    if (!session) {
      return reply.code(401).send(unauthorized);
    }
    const id = groupIdSchema.safeParse(request.params.id);
    const group = id.success ? await groupStore.findGroupForMember(id.data, session.user.id) : null;
    if (!group) {
      return reply.code(404).send(notFound);
    }
    return toResponse(group);
  });
}
