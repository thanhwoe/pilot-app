import { describe, expect, it, vi } from "vitest";
import { createGroupsApi } from "./api";

const group = {
  id: "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d",
  name: "Đà Lạt",
  memberCount: 1,
  createdAt: "2026-11-02T10:00:00.000Z",
};

const listItem = { ...group, hasInvite: false };
const inviteToken = "B".repeat(43);

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: body === undefined ? {} : { "content-type": "application/json" },
      }),
  );
}

describe("createGroupsApi", () => {
  it("gets /groups with the bearer token and parses the list", async () => {
    const fetchFn = fakeFetch(200, { groups: [listItem] });
    const api = createGroupsApi("http://api.test", fetchFn);

    expect(await api.listGroups("t0ken")).toEqual({ ok: true, data: { groups: [listItem] } });
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/groups", {
      headers: { authorization: "Bearer t0ken" },
      signal: expect.any(AbortSignal),
    });
  });

  it("posts the name to /groups with the bearer token and parses the group", async () => {
    const fetchFn = fakeFetch(201, group);
    const api = createGroupsApi("http://api.test", fetchFn);

    expect(await api.createGroup("t0ken", { name: "Đà Lạt" })).toEqual({ ok: true, data: group });
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/groups", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t0ken" },
      body: JSON.stringify({ name: "Đà Lạt" }),
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    [400, "invalid_request"],
    [401, "unauthorized"],
    [404, "not_found"],
  ] as const)("reads a %i with %s as that error", async (status, error) => {
    const api = createGroupsApi("http://api.test", fakeFetch(status, { error }));

    expect(await api.listGroups("t0ken")).toEqual({ ok: false, error });
  });

  it("reads a network failure as unavailable", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const api = createGroupsApi("http://api.test", fetchFn);

    expect(await api.createGroup("t0ken", { name: "Nhà" })).toEqual({
      ok: false,
      error: "unavailable",
    });
  });

  it("reads a body that doesn't match the shared schema as unavailable", async () => {
    const api = createGroupsApi("http://api.test", fakeFetch(200, { groups: [{ name: "Nhà" }] }));

    expect(await api.listGroups("t0ken")).toEqual({ ok: false, error: "unavailable" });
  });

  it("gives up after the timeout and reads it as unavailable", async () => {
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const api = createGroupsApi("http://api.test", fetchFn, 10);

    expect(await api.listGroups("t0ken")).toEqual({ ok: false, error: "unavailable" });
  });

  it("#94 AC 1: posts to /groups/:id/invite with the bearer token and parses the new token", async () => {
    const fetchFn = fakeFetch(201, { token: inviteToken });
    const api = createGroupsApi("http://api.test", fetchFn);

    expect(await api.createInvite("t0ken", group.id)).toEqual({
      ok: true,
      data: { token: inviteToken },
    });
    expect(fetchFn).toHaveBeenCalledWith(`http://api.test/groups/${group.id}/invite`, {
      method: "POST",
      headers: { authorization: "Bearer t0ken" },
      signal: expect.any(AbortSignal),
    });
  });

  it("#94 AC 2: posts the invite token in the body, not the URL, to preview it", async () => {
    const preview = { groupName: "Đà Lạt", alreadyMember: false };
    const fetchFn = fakeFetch(200, preview);
    const api = createGroupsApi("http://api.test", fetchFn);

    expect(await api.previewInvite("t0ken", inviteToken)).toEqual({ ok: true, data: preview });
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/invites/preview", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t0ken" },
      body: JSON.stringify({ token: inviteToken }),
      signal: expect.any(AbortSignal),
    });
  });

  it("#94 AC 2: posts the invite token in the body, not the URL, to join, and parses the group", async () => {
    const fetchFn = fakeFetch(200, group);
    const api = createGroupsApi("http://api.test", fetchFn);

    expect(await api.joinWithInvite("t0ken", inviteToken)).toEqual({ ok: true, data: group });
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/invites/join", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t0ken" },
      body: JSON.stringify({ token: inviteToken }),
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    [
      "createInvite",
      (api: ReturnType<typeof createGroupsApi>) => api.createInvite("t0ken", group.id),
    ],
    [
      "previewInvite",
      (api: ReturnType<typeof createGroupsApi>) => api.previewInvite("t0ken", inviteToken),
    ],
    [
      "joinWithInvite",
      (api: ReturnType<typeof createGroupsApi>) => api.joinWithInvite("t0ken", inviteToken),
    ],
  ])("#94 AC 5: %s reads a 404 as not_found and a 401 as unauthorized", async (_name, call) => {
    expect(
      await call(createGroupsApi("http://api.test", fakeFetch(404, { error: "not_found" }))),
    ).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await call(createGroupsApi("http://api.test", fakeFetch(401, { error: "unauthorized" }))),
    ).toEqual({ ok: false, error: "unauthorized" });
  });
});
