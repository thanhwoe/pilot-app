import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApiCall } from "./api-client";
import { guardSession } from "./session-guard";

const schema = z.object({ name: z.string() });

/** A call as a screen added later would write it: no 401 handling of its own. */
function callWith(fetchFn: (url: string, init: RequestInit) => Promise<Response>, timeoutMs = 50) {
  return createApiCall("http://api.test", fetchFn, timeoutMs)("/things", {}, schema);
}

function answering(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status });
}

describe("guardSession", () => {
  it("[security] #31 AC 1: reads a 401 unauthorized as signed out, whichever call it is", async () => {
    const result = await callWith(answering(401, { error: "unauthorized" }));

    expect(guardSession(result)).toEqual({ kind: "signed-out" });
  });

  it("returns the data of a successful call", async () => {
    const result = await callWith(answering(200, { name: "Đà Lạt" }));

    expect(guardSession(result)).toEqual({ kind: "ok", data: { name: "Đà Lạt" } });
  });

  it.each([
    ["a 400 invalid_request", answering(400, { error: "invalid_request" }), "invalid_request"],
    ["a 401 invalid_code", answering(401, { error: "invalid_code" }), "invalid_code"],
    ["a 404 not_found", answering(404, { error: "not_found" }), "not_found"],
    [
      "a 429 too_many_requests",
      answering(429, { error: "too_many_requests" }),
      "too_many_requests",
    ],
    ["a 500", answering(500, { message: "boom" }), "unavailable"],
    ["a body that breaks the schema", answering(200, { name: 1 }), "unavailable"],
    ["a body that is not JSON", async () => new Response("<html>", { status: 502 }), "unavailable"],
    [
      "a network failure",
      async () => {
        throw new TypeError("fetch failed");
      },
      "unavailable",
    ],
    [
      "an API that never answers",
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")));
        }),
      "unavailable",
    ],
  ] as const)("[security] #31 AC 2: never reads %s as signed out", async (_, fetchFn, error) => {
    const result = await callWith(fetchFn);

    expect(guardSession(result)).toEqual({ kind: "failed", error });
  });
});
