import { sessionExpiresAt } from "@gop/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthStore } from "./store";

const minute = 60_000;
const t0 = new Date("2026-10-29T10:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

export interface StoreHarness {
  store: AuthStore;
  close: () => Promise<void>;
}

/**
 * The behaviour every `AuthStore` must have. Runs against Postgres and the in-memory fake, so
 * route tests that use the fake see what production sees.
 */
export function describeAuthStoreContract(name: string, open: () => Promise<StoreHarness>) {
  describe(`${name} AuthStore`, () => {
    let store: AuthStore;
    let harness: StoreHarness;
    let emailCounter = 0;
    const nextEmail = () => `person${++emailCounter}@example.com`;

    beforeAll(async () => {
      harness = await open();
      store = harness.store;
    });

    afterAll(async () => {
      await harness.close();
    });

    async function saveCode(email: string, codeHash: string, now = t0) {
      expect(await store.issueCode({ email, codeHash, now })).toBe(true);
    }

    function signIn(
      email: string,
      codeHash: string,
      now = at(minute),
      tokenHash = `token-${codeHash}-${now.getTime()}`,
    ) {
      return store.signInWithCode({
        email,
        codeHash,
        now,
        session: { tokenHash, createdAt: now, expiresAt: sessionExpiresAt(now) },
      });
    }

    it("issues at most 5 codes per email in 15 minutes", async () => {
      const email = nextEmail();
      for (let request = 0; request < 5; request++) {
        await saveCode(email, `code-${request}`, at(request * minute));
      }
      await saveCode(nextEmail(), "other", at(5 * minute));

      expect(await store.issueCode({ email, codeHash: "sixth", now: at(5 * minute) })).toBe(false);
      expect(await store.countCodesSince(email, at(0))).toBe(5);
      expect(await store.issueCode({ email, codeHash: "later", now: at(15 * minute + 1) })).toBe(
        true,
      );
    });

    it("issues at most 5 codes even when requests arrive together", async () => {
      const email = nextEmail();

      const issued = await Promise.all(
        Array.from({ length: 10 }, (_, request) =>
          store.issueCode({ email, codeHash: `p-${request}`, now: t0 }),
        ),
      );

      expect(issued.filter(Boolean)).toHaveLength(5);
      expect(await store.countCodesSince(email, at(0))).toBe(5);
    });

    it("treats the last code issued as the newest, even at the same instant", async () => {
      const email = nextEmail();
      await saveCode(email, "first", t0);
      await saveCode(email, "second", t0);

      expect(await signIn(email, "first")).toBeNull();
      expect(await signIn(email, "second")).not.toBeNull();
    });

    it("creates the account on the first sign-in and reuses it after", async () => {
      const email = nextEmail();
      await saveCode(email, "first");
      const first = await signIn(email, "first");

      await saveCode(email, "second", at(2 * minute));
      const second = await signIn(email, "second", at(3 * minute));

      expect(first).toEqual({ id: expect.any(String), email });
      expect(second).toEqual(first);
    });

    it("rejects a wrong code, and the right one after 5 wrong attempts", async () => {
      const email = nextEmail();
      await saveCode(email, "right");

      for (let attempt = 0; attempt < 5; attempt++) {
        expect(await signIn(email, "wrong")).toBeNull();
      }
      expect(await signIn(email, "right")).toBeNull();
    });

    it("rejects a code that was already used", async () => {
      const email = nextEmail();
      await saveCode(email, "once");

      expect(await signIn(email, "once")).not.toBeNull();
      expect(await signIn(email, "once", at(2 * minute))).toBeNull();
    });

    it("rejects a code that a newer one replaced", async () => {
      const email = nextEmail();
      await saveCode(email, "old", at(0));
      await saveCode(email, "new", at(1));

      expect(await signIn(email, "old")).toBeNull();
      expect(await signIn(email, "new")).not.toBeNull();
    });

    it("rejects an expired code", async () => {
      const email = nextEmail();
      await saveCode(email, "late");

      expect(await signIn(email, "late", at(10 * minute))).toBeNull();
    });

    it("rejects a code for an email that never asked for one", async () => {
      expect(await signIn(nextEmail(), "anything")).toBeNull();
    });

    it("finds the user of a live session, and nobody after it expires", async () => {
      const email = nextEmail();
      await saveCode(email, "s");
      const user = await signIn(email, "s", at(minute), "session-1");

      expect(await store.findSessionUser("session-1", at(2 * minute))).toEqual(user);
      expect(await store.findSessionUser("session-1", sessionExpiresAt(at(minute)))).toBeNull();
      expect(await store.findSessionUser("unknown", at(2 * minute))).toBeNull();
    });

    it("deletes a session", async () => {
      const email = nextEmail();
      await saveCode(email, "d");
      await signIn(email, "d", at(minute), "session-2");

      expect(await store.deleteSession("session-2")).toBe(true);
      expect(await store.findSessionUser("session-2", at(2 * minute))).toBeNull();
      expect(await store.deleteSession("session-2")).toBe(false);
    });

    it("lets only one of two simultaneous sign-ins use a code", async () => {
      const email = nextEmail();
      await saveCode(email, "race");

      const results = await Promise.all([
        signIn(email, "race", at(minute), "race-a"),
        signIn(email, "race", at(minute), "race-b"),
      ]);

      expect(results.filter((user) => user !== null)).toHaveLength(1);
    });
  });
}
