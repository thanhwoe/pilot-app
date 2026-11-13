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

  describe("#97", () => {
    const me = "6f1c1d2e-8b7a-4c3d-9e0f-1a2b3c4d5e6f";
    const detail = { ...group, members: [{ userId: me, email: "an@example.com" }] };
    const expense = {
      id: "3d9e0f1a-2b3c-4d5e-8f6a-7b8c9d0e1f2a",
      groupId: group.id,
      payerId: me,
      amount: 90000,
      description: "An toi",
      createdAt: "2026-11-13T10:00:00.000Z",
      shares: [{ userId: me, amount: 90000 }],
    };
    const body = {
      payerId: me,
      amount: 90000,
      description: "An toi",
      splitBetween: [me],
    };

    it("gets /groups/:id with the bearer token and parses the group with its members", async () => {
      const fetchFn = fakeFetch(200, detail);
      const api = createGroupsApi("http://api.test", fetchFn);

      expect(await api.getGroup("t0ken", group.id)).toEqual({ ok: true, data: detail });
      expect(fetchFn).toHaveBeenCalledWith(`http://api.test/groups/${group.id}`, {
        headers: { authorization: "Bearer t0ken" },
        signal: expect.any(AbortSignal),
      });
    });

    it("reads a group answer with no members as unavailable", async () => {
      const api = createGroupsApi("http://api.test", fakeFetch(200, group));

      expect(await api.getGroup("t0ken", group.id)).toEqual({ ok: false, error: "unavailable" });
    });

    it("gets /groups/:id/expenses with the bearer token and parses the list", async () => {
      const fetchFn = fakeFetch(200, { expenses: [expense] });
      const api = createGroupsApi("http://api.test", fetchFn);

      expect(await api.listExpenses("t0ken", group.id)).toEqual({
        ok: true,
        data: { expenses: [expense] },
      });
      expect(fetchFn).toHaveBeenCalledWith(`http://api.test/groups/${group.id}/expenses`, {
        headers: { authorization: "Bearer t0ken" },
        signal: expect.any(AbortSignal),
      });
    });

    it("posts the expense to /groups/:id/expenses with the bearer token and parses it", async () => {
      const fetchFn = fakeFetch(201, expense);
      const api = createGroupsApi("http://api.test", fetchFn);

      expect(await api.createExpense("t0ken", group.id, body)).toEqual({
        ok: true,
        data: expense,
      });
      expect(fetchFn).toHaveBeenCalledWith(`http://api.test/groups/${group.id}/expenses`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer t0ken" },
        body: JSON.stringify(body),
        signal: expect.any(AbortSignal),
      });
    });

    it.each([
      ["getGroup", (api: ReturnType<typeof createGroupsApi>) => api.getGroup("t0ken", group.id)],
      [
        "listExpenses",
        (api: ReturnType<typeof createGroupsApi>) => api.listExpenses("t0ken", group.id),
      ],
      [
        "createExpense",
        (api: ReturnType<typeof createGroupsApi>) => api.createExpense("t0ken", group.id, body),
      ],
    ])("reads a 401 from %s as unauthorized", async (_name, call) => {
      const api = createGroupsApi("http://api.test", fakeFetch(401, { error: "unauthorized" }));

      expect(await call(api)).toEqual({ ok: false, error: "unauthorized" });
    });
  });
});
