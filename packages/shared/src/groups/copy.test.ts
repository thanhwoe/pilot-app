import { describe, expect, it } from "vitest";
import { groupsCopy } from "./copy";

// #21 A2: the web and the mobile app show the same loading and retry text.
describe("groupsCopy", () => {
  it("has the loading line and the retry button text", () => {
    expect(groupsCopy.loading).toBe("Đang tải nhóm…");
    expect(groupsCopy.retry).toBe("Thử lại");
  });
});
