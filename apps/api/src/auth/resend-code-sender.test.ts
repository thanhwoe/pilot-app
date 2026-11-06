import { SIGN_IN_CODE_TTL_MS } from "@gop/shared";
import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createResendCodeSender } from "./resend-code-sender";

const apiKey = "re_test_key_123";
const code = "493817";
const email = "ana@example.com";
const providerDetail = "provider-secret-detail";

function fakeLog() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };
}

function send(fetch: typeof globalThis.fetch, timeoutMs?: number) {
  const log = fakeLog();
  const sender = createResendCodeSender({ apiKey, fetch, timeoutMs });
  const result = sender(email, code, log as unknown as FastifyBaseLogger);
  return { result, log };
}

/** Everything a failed send can show: the rejection and each call to the log. */
function leaks(error: unknown, log: ReturnType<typeof fakeLog>) {
  return JSON.stringify([
    error instanceof Error ? [error.message, error.cause, error.stack] : error,
    Object.values(log).map((fn) => fn.mock.calls),
  ]);
}

describe("createResendCodeSender", () => {
  it("posts the code once to Resend, from the Góp address, to the given email", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }),
    );
    const { result, log } = send(fetch);

    await result;

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${apiKey}`);
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(init.body as string) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
    };
    expect(body.from).toBe("Góp <onboarding@resend.dev>");
    expect(body.to).toEqual([email]);
    expect(body.subject).toBe("Mã đăng nhập Góp của bạn");
    expect(Object.keys(body).sort()).toEqual(["from", "subject", "text", "to"]);
    expect(Object.values(log).flatMap((fn) => fn.mock.calls)).toEqual([]);
  });

  it.each([200, 500])("cancels the response body when Resend answers %i", async (status) => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const fetch = vi.fn(async () => new Response(body, { status }));

    await send(fetch).result.catch(() => undefined);

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("writes the email as the owner approved, with the code on a line of its own", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response("{}", { status: 200 }),
    );
    await send(fetch).result;

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const { text, subject } = JSON.parse(init.body as string) as { text: string; subject: string };
    expect(SIGN_IN_CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(text).toBe(
      [
        "Mã đăng nhập Góp của bạn là:",
        "Your Góp sign-in code is:",
        "",
        code,
        "",
        "Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email này.",
      ].join("\n"),
    );
    expect(text.split("\n")).toContain(code);
    expect(subject).not.toContain(code);
  });

  it.each([401, 403, 422, 500])(
    "rejects with a fixed message when Resend answers %i, and shows nothing of the provider",
    async (status) => {
      const fetch = vi.fn(
        async () => new Response(JSON.stringify({ message: providerDetail }), { status }),
      );
      const { result, log } = send(fetch);

      const error = await result.then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Could not send the sign-in code");
      expect((error as Error).cause).toBeUndefined();
      const shown = leaks(error, log);
      for (const secret of [providerDetail, apiKey, code]) {
        expect(shown).not.toContain(secret);
      }
      expect(shown).toContain(String(status));
    },
  );

  it("rejects with the same fixed message when fetch fails", async () => {
    const fetch = vi.fn(async () => {
      throw new Error(`connect failed ${providerDetail} ${apiKey}`);
    });
    const { result, log } = send(fetch);

    const error = await result.then(
      () => undefined,
      (e: unknown) => e,
    );

    expect((error as Error).message).toBe("Could not send the sign-in code");
    expect((error as Error).cause).toBeUndefined();
    const shown = leaks(error, log);
    for (const secret of [providerDetail, apiKey, code]) {
      expect(shown).not.toContain(secret);
    }
  });

  it("rejects with the same fixed message when fetch never answers", async () => {
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const { result } = send(fetch as unknown as typeof globalThis.fetch, 10);

    await expect(result).rejects.toThrow(/^Could not send the sign-in code$/);
  });
});
