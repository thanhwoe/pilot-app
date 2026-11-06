import {
  type CreateInviteResponse,
  createGroupBodySchema,
  type ErrorResponse,
  type GroupListItem,
  type GroupListResponse,
  type GroupResponse,
  type InvitePreviewResponse,
  inviteTokenBodySchema,
  inviteTokenSchema,
} from "@gop/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generateInviteToken, hashSecret } from "../auth/secrets";
import { createSessionCheck, type SessionDeps } from "../auth/session";
import type { GroupStore, StoredGroup, StoredGroupListItem } from "./store";

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

/** A group in the caller's list: the group, and whether it has an invite link. */
function toListItem(group: StoredGroupListItem): GroupListItem {
  return { ...toResponse(group), hasInvite: group.hasInvite };
}

export function registerGroupRoutes(app: FastifyInstance, deps: GroupDeps) {
  const { groupStore, authSecret, now } = deps;
  const findSession = createSessionCheck(deps);

  /**
   * The group an invite token leads to. A token of the wrong shape, one no group has and one that
   * was replaced all give null, so the caller's answer is the same for each.
   */
  async function findInviteTarget(token: string) {
    return inviteTokenSchema.safeParse(token).success
      ? groupStore.findGroupByInviteHash(hashSecret(token, authSecret))
      : null;
  }

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
    const response: GroupListResponse = { groups: groups.map(toListItem) };
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

  // Any member can make the link, or replace it: the old one then finds nothing. Only the hash is
  // kept, so this answer is the one time the token can be shown.
  app.post<{ Params: { id: string } }>("/groups/:id/invite", async (request, reply) => {
    const session = await findSession(request);
    if (!session) {
      return reply.code(401).send(unauthorized);
    }
    const id = groupIdSchema.safeParse(request.params.id);
    const group = id.success ? await groupStore.findGroupForMember(id.data, session.user.id) : null;
    if (!group) {
      return reply.code(404).send(notFound);
    }
    const token = generateInviteToken();
    await groupStore.setInviteTokenHash(group.id, hashSecret(token, authSecret));
    const response: CreateInviteResponse = { token };
    return reply.code(201).send(response);
  });

  // The invite token travels in the body, not the URL, because the API logs request URLs.
  // Checks run in this order: session (401), body (400), token (404, the same for every token that
  // doesn't work).
  app.post("/invites/preview", async (request, reply) => {
    const session = await findSession(request);
    if (!session) {
      return reply.code(401).send(unauthorized);
    }
    const body = inviteTokenBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(invalidRequest);
    }
    const target = await findInviteTarget(body.data.token);
    if (!target) {
      return reply.code(404).send(notFound);
    }
    const member = await groupStore.findGroupForMember(target.id, session.user.id);
    const response: InvitePreviewResponse = {
      groupName: target.name,
      alreadyMember: member !== null,
    };
    return response;
  });

  app.post("/invites/join", async (request, reply) => {
    const session = await findSession(request);
    if (!session) {
      return reply.code(401).send(unauthorized);
    }
    const body = inviteTokenBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(invalidRequest);
    }
    const target = await findInviteTarget(body.data.token);
    if (!target) {
      return reply.code(404).send(notFound);
    }
    // A member joining again changes nothing.
    await groupStore.joinGroup(target.id, session.user.id, now());
    const group = await groupStore.findGroupForMember(target.id, session.user.id);
    return group ? toResponse(group) : reply.code(404).send(notFound);
  });
}
