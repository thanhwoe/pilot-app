import { renderHook } from "@testing-library/react-native";
import { setPendingInvite, takePendingInvite, usePendingInviteHref } from "@/lib/pending-invite";

const token = "A".repeat(43);

beforeEach(() => {
  takePendingInvite();
});

// #98 AC 3: the app comes back to the invite only for a token that could be an invite.
describe("setPendingInvite", () => {
  test("keeps a well-formed token and says so", () => {
    expect(setPendingInvite(token)).toBe(true);
    expect(takePendingInvite()).toBe(token);
  });

  test("takes a token once", () => {
    setPendingInvite(token);
    takePendingInvite();

    expect(takePendingInvite()).toBeNull();
  });

  test.each([
    ["short", "short"],
    ["a 44-character token", "A".repeat(44)],
    ["a 42-character token", "A".repeat(42)],
    ["a slash", `${"A".repeat(42)}/`],
    ["a plus", `${"A".repeat(42)}+`],
    ["an equals sign", `${"A".repeat(42)}=`],
    ["an empty string", ""],
    ["undefined", undefined],
    ["a list", [token]],
  ])("refuses %s and keeps nothing", (_what, value) => {
    expect(setPendingInvite(value)).toBe(false);
    expect(takePendingInvite()).toBeNull();
  });

  test("a refused token clears the one that was kept, so the latest link wins", () => {
    setPendingInvite(token);
    setPendingInvite("short");

    expect(takePendingInvite()).toBeNull();
  });
});

describe("usePendingInviteHref", () => {
  test("gives the pending invite's path once, and forgets it", async () => {
    setPendingInvite(token);

    const { result } = await renderHook(() => usePendingInviteHref());

    expect(result.current).toBe(`/invite/${token}`);
    expect(takePendingInvite()).toBeNull();
  });

  test("gives nothing when no invite is pending", async () => {
    const { result } = await renderHook(() => usePendingInviteHref());

    expect(result.current).toBeNull();
  });

  test("a screen that opens later does not return to the same invite", async () => {
    setPendingInvite(token);
    await renderHook(() => usePendingInviteHref());

    const { result } = await renderHook(() => usePendingInviteHref());

    expect(result.current).toBeNull();
  });

  test("keeps its answer across re-renders of the same screen", async () => {
    setPendingInvite(token);
    const { result, rerender } = await renderHook(() => usePendingInviteHref());

    await rerender({});

    expect(result.current).toBe(`/invite/${token}`);
  });
});
