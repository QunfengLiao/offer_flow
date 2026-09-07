import { describe, expect, it } from "vitest";
import { ApplicationStatus } from "@prisma/client";
import { getInactiveDays, getReminderLevel } from "./date";

describe("无动态天数与提醒规则", () => {
  const today = new Date(2026, 8, 3, 18, 0, 0);

  it("按自然日计算，而不是按 24 小时计算", () => {
    expect(getInactiveDays(new Date(2026, 8, 2, 23, 59, 0), today)).toBe(1);
    expect(getInactiveDays(new Date(2026, 7, 20, 12, 0, 0), today)).toBe(14);
  });

  it("7 到 13 天黄色，14 天以上红色", () => {
    expect(getReminderLevel(6, ApplicationStatus.APPLIED)).toBe("normal");
    expect(getReminderLevel(7, ApplicationStatus.APPLIED)).toBe("warning");
    expect(getReminderLevel(13, ApplicationStatus.APPLIED)).toBe("warning");
    expect(getReminderLevel(14, ApplicationStatus.APPLIED)).toBe("danger");
  });

  it("Offer、被拒和流程结束不提醒", () => {
    for (const status of [ApplicationStatus.OFFER, ApplicationStatus.REJECTED, ApplicationStatus.CLOSED]) {
      expect(getReminderLevel(30, status)).toBe("normal");
    }
  });
});
