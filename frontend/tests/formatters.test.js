import { describe, expect, it } from "vitest";

import { formatItemLabel } from "../utils/formatters";

describe("formatItemLabel", () => {
  it("formats item label", () => {
    expect(formatItemLabel({ category: "Top", name: "Shirt", color: "White" })).toBe("Top: Shirt (White)");
  });

  it("falls back for missing fields", () => {
    expect(formatItemLabel({})).toBe("Item: Unknown (Unknown)");
  });
});
