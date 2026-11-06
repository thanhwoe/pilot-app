import { describe, expect, it } from "vitest";
import { invitePath, safeReturnPath } from "./return-path";

const token = "Ab3-_".repeat(8) + "xyz"; // 43 characters

describe("safeReturnPath", () => {
  it("#94 AC 4: keeps an invite path with a token of the right shape", () => {
    expect(token).toHaveLength(43);
    expect(safeReturnPath(`/invite/${token}`)).toBe(`/invite/${token}`);
    expect(safeReturnPath(invitePath(token))).toBe(`/invite/${token}`);
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a number", 42],
    ["a list", [`/invite/${token}`]],
    ["an empty string", ""],
    ["the home page", "/"],
    ["another page of this site", "/sign-in"],
    ["an absolute address", "https://example.com"],
    ["an absolute address with the invite path", `https://example.com/invite/${token}`],
    ["a protocol-relative address", "//example.com"],
    ["a protocol-relative address with the invite path", `//example.com/invite/${token}`],
    ["a backslash address", "/\\example.com"],
    ["a token that is too short", `/invite/${token.slice(1)}`],
    ["a token that is too long", `/invite/${token}A`],
    ["a token with a character a token never has", `/invite/${token.slice(1)}+`],
    ["more path after the token", `/invite/${token}/extra`],
    ["a query after the token", `/invite/${token}?x=1`],
    ["a fragment after the token", `/invite/${token}#x`],
    ["a newline after the token", `/invite/${token}\n`],
    ["a newline before it", `\n/invite/${token}`],
    ["a percent-encoded slash", `/invite%2F${token}`],
    ["no leading slash", `invite/${token}`],
    ["a javascript address", "javascript:alert(1)"],
  ])("#94 AC 4: sends %s to the home page", (_name, value) => {
    expect(safeReturnPath(value)).toBe("/");
  });
});
