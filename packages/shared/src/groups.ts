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

/** Response of `POST /groups` (201) and `GET /groups/:id`. */
export const groupResponseSchema = groupSchema;

export type GroupResponse = z.infer<typeof groupResponseSchema>;

/** Response of `GET /groups`: the caller's groups, newest first. */
export const groupListResponseSchema = z.object({
  groups: z.array(groupSchema),
});

export type GroupListResponse = z.infer<typeof groupListResponseSchema>;
