import { z } from "zod";

export const GROUP_NAME_MAX_LENGTH = 100;

/** A group name as the API stores it: trimmed, 1 to 100 characters. Names need not be unique. */
export const groupNameSchema = z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH);

/** Body of `POST /groups`. */
export const createGroupBodySchema = z.object({
  name: groupNameSchema,
});

export type CreateGroupBody = z.infer<typeof createGroupBodySchema>;

export const groupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  memberCount: z.int().positive(),
  createdAt: z.iso.datetime(),
});

export type Group = z.infer<typeof groupSchema>;

/** Response of `POST /groups` (201). */
export const groupResponseSchema = groupSchema;

export type GroupResponse = z.infer<typeof groupResponseSchema>;

/** A member as the group's own screen shows them: there are no display names, so the email. */
export const groupMemberSchema = z.object({
  userId: z.uuid(),
  email: z.string(),
});

export type GroupMember = z.infer<typeof groupMemberSchema>;

/**
 * Response of `GET /groups/:id` (#97): the group and its members in the order they joined, so a
 * screen can name a payer and split between everyone. A group always has its creator.
 */
export const groupDetailResponseSchema = groupSchema.extend({
  members: z.array(groupMemberSchema).min(1),
});

export type GroupDetailResponse = z.infer<typeof groupDetailResponseSchema>;

/** A group in the caller's list: the group, and whether it has an invite link (#94). */
export const groupListItemSchema = groupSchema.extend({
  hasInvite: z.boolean(),
});

export type GroupListItem = z.infer<typeof groupListItemSchema>;

/** Response of `GET /groups`: the caller's groups, newest first. */
export const groupListResponseSchema = z.object({
  groups: z.array(groupListItemSchema),
});

export type GroupListResponse = z.infer<typeof groupListResponseSchema>;

/**
 * An invite token as the API makes it: 32 random bytes as base64url, so 43 characters of letters,
 * digits, `-` and `_`. The web, the API and the mobile app all check this shape.
 */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Response of `POST /groups/:id/invite` (201): the new token. It is shown only this once. */
export const createInviteResponseSchema = z.object({
  token: inviteTokenSchema,
});

export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;

/**
 * Body of `POST /invites/preview` and `POST /invites/join`. Any string passes here, so a wrong
 * token gets the same answer as a made-up one instead of a different error. The token travels in
 * a body because the API logs request URLs.
 */
export const inviteTokenBodySchema = z.object({
  token: z.string(),
});

export type InviteTokenBody = z.infer<typeof inviteTokenBodySchema>;

/** Response of `POST /invites/preview`: what a visitor sees before joining. */
export const invitePreviewResponseSchema = z.object({
  groupName: z.string(),
  alreadyMember: z.boolean(),
});

export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;
