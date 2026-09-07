import { describe, expect, it } from "vitest";
import { buildPositionInput } from "./application-form";
import { updateApplicationSchema } from "./validations";

describe("application form position payload", () => {
  it("derives priorities from the visible position order", () => {
    expect(buildPositionInput([
      { title: "第一志愿" },
      { title: "  " },
      { title: "第三志愿" },
    ])).toEqual([
      { priority: 1, title: "第一志愿" },
      { priority: 3, title: "第三志愿" },
    ]);
  });

  it("supports five imported positions without losing them", () => {
    const positions = buildPositionInput(Array.from({ length: 5 }, (_, index) => ({ title: `职位 ${index + 1}` })));
    const result = updateApplicationSchema.safeParse({
      companyName: "挚文集团-陌陌",
      applicationUrl: "https://example.com/applications",
      appliedAt: "2026-08-20",
      currentStatus: "APPLIED",
      positions,
    });

    expect(result.success).toBe(true);
    expect(positions.map((position) => position.priority)).toEqual([1, 2, 3, 4, 5]);
  });
});
