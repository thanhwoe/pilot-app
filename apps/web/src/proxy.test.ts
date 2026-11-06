import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "./lib/session-cookie";
import { proxy } from "./proxy";

const token = "Ab3-_".repeat(8) + "xyz";

function request(path: string, init: { method?: string; signedIn?: boolean } = {}) {
  return new NextRequest(`http://web.test${path}`, {
    method: init.method ?? "GET",
    headers: init.signedIn ? { cookie: `${SESSION_COOKIE}=t0ken` } : {},
  });
}

const location = (response: Response) => response.headers.get("location");

describe("proxy on /invite", () => {
  it("#94 AC 4: sends a signed-out visitor to sign-in, which remembers the invite", () => {
    const response = proxy(request(`/invite/${token}`));

    expect(response.status).toBe(307);
    expect(location(response)).toBe(
      `http://web.test/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`,
    );
  });

  it("#94 AC 4: sends a signed-out visitor with a link of the wrong shape to plain sign-in", () => {
    const response = proxy(request("/invite/not-a-token"));

    expect(response.status).toBe(307);
    expect(location(response)).toBe("http://web.test/sign-in");
  });

  it("#94 AC 2: lets a signed-in visitor through", () => {
    const response = proxy(request(`/invite/${token}`, { signedIn: true }));

    expect(location(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("#94 AC 2: lets a Server Action post to the invite page through, signed in or not", () => {
    for (const signedIn of [true, false]) {
      const response = proxy(request(`/invite/${token}`, { method: "POST", signedIn }));
      expect(location(response)).toBeNull();
    }
  });
});

describe("proxy on / and /sign-in", () => {
  it("still sends a signed-out visitor from / to sign-in", () => {
    expect(location(proxy(request("/")))).toBe("http://web.test/sign-in");
  });

  it("still sends a signed-in visitor from /sign-in to /", () => {
    expect(location(proxy(request("/sign-in", { signedIn: true })))).toBe("http://web.test/");
  });

  it("still lets a signed-out visitor open /sign-in, with or without next", () => {
    expect(location(proxy(request("/sign-in")))).toBeNull();
    expect(location(proxy(request(`/sign-in?next=/invite/${token}`)))).toBeNull();
  });
});
