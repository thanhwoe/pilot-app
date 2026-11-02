import { describe, expect, it, vi } from "vitest";
import { createGroupsApi } from "./api";

const group = {
  id: "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d",
  name: "Đà Lạt",
  memberCount: 1,
  createdAt: "2026-11-02T10:00:00.000Z",
};

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
    const fetchFn = fakeFetch(200, { groups: [group] });
    const api = createGroupsApi("http://api.test", fetchFn);

    expect(await api.listGroups("t0ken")).toEqual({ ok: true, data: { groups: [group] } });
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
});
