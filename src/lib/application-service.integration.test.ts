import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { ApplicationStatus, EventType } from "@prisma/client";
import { prisma } from "./prisma";
import { addApplicationNoteForUser, createApplication, deleteApplicationForUser, getApplicationForUser, getDashboardForUser, listApplicationsForUser, updateApplicationForUser } from "./application-service";
import { applicationSchema } from "./validations";
import { createCategoryForUser, deleteCategoryForUser, renameCategoryForUser, updateCompanyForUser } from "./company-service";

const stamp = Date.now();
const input = { companyName: "测试公司 A", applicationUrl: "https://example.com/a", appliedAt: "2026-08-01", positions: [{ priority: 1, title: "前端工程师" }], note: "测试" };

describe("投递服务的事务与用户隔离", () => {
  let userA: { id: string };
  let userB: { id: string };
  let applicationA: Awaited<ReturnType<typeof createApplication>>;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("test-password", 4);
    const [a, b] = await Promise.all([
      prisma.user.create({ data: { username: "测试用户 A", email: `service-a-${stamp}@example.com`, passwordHash } }),
      prisma.user.create({ data: { username: "测试用户 B", email: `service-b-${stamp}@example.com`, passwordHash } }),
    ]);
    userA = a; userB = b;
    applicationA = await createApplication(userA.id, input);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  });

  it("创建时自动生成已投递历史，并且用户条件生效", async () => {
    expect(applicationA.currentStatus).toBe(ApplicationStatus.APPLIED);
    expect(applicationA.events).toHaveLength(1);
    expect(applicationA.events[0].type).toBe(EventType.STATUS_CHANGE);
    expect(applicationA.events[0].toStatus).toBe(ApplicationStatus.APPLIED);
    expect(await getApplicationForUser(userA.id, applicationA.id)).not.toBeNull();
    expect(await getApplicationForUser(userB.id, applicationA.id)).toBeNull();
  });

  it("状态变更在一次事务中更新状态、最后动态和历史", async () => {
    const updated = await updateApplicationForUser(userA.id, applicationA.id, { ...input, currentStatus: ApplicationStatus.FIRST_INTERVIEW, eventDescription: "约好周五一面" });
    expect(updated?.currentStatus).toBe(ApplicationStatus.FIRST_INTERVIEW);
    expect(updated?.lastActivityAt).not.toBe(applicationA.lastActivityAt);
    expect(updated?.events.some((event) => event.fromStatus === ApplicationStatus.APPLIED && event.toStatus === ApplicationStatus.FIRST_INTERVIEW && event.description === "约好周五一面")).toBe(true);
  });

  it("普通动态不修改状态但会更新最后动态", async () => {
    const before = await getApplicationForUser(userA.id, applicationA.id);
    const updated = await addApplicationNoteForUser(userA.id, applicationA.id, "联系了 HR，等待回复");
    expect(updated?.currentStatus).toBe(ApplicationStatus.FIRST_INTERVIEW);
    expect(new Date(updated!.lastActivityAt).getTime()).toBeGreaterThanOrEqual(new Date(before!.lastActivityAt).getTime());
    expect(updated?.inactiveDays).toBe(before?.inactiveDays);
    expect(updated?.events.some((event) => event.type === EventType.NOTE && event.description === "联系了 HR，等待回复")).toBe(true);
  });

  it("B 无法查看、修改、删除 A 的投递或新增动态", async () => {
    expect(await updateApplicationForUser(userB.id, applicationA.id, { ...input, currentStatus: ApplicationStatus.OFFER })).toBeNull();
    expect(await addApplicationNoteForUser(userB.id, applicationA.id, "越权动态")).toBeNull();
    expect(await deleteApplicationForUser(userB.id, applicationA.id)).toBe(false);
    expect(await getApplicationForUser(userA.id, applicationA.id)).not.toBeNull();
  });

  it("伪造输入 userId 不会改变服务端传入的归属，Dashboard 统计独立", async () => {
    const forged = applicationSchema.parse({ ...input, companyName: "用户 B 自己的投递", userId: userA.id });
    const applicationB = await createApplication(userB.id, forged);
    const dashboardA = await getDashboardForUser(userA.id);
    const dashboardB = await getDashboardForUser(userB.id);
    expect(await getApplicationForUser(userA.id, applicationB.id)).toBeNull();
    expect(await getApplicationForUser(userB.id, applicationB.id)).not.toBeNull();
    expect(dashboardA.total).toBe(1);
    expect(dashboardB.total).toBe(1);
    expect(dashboardA.active).toBe(1);
    expect(dashboardB.active).toBe(1);
    expect(dashboardA.rejected).toBe(0);
    expect(dashboardA.progress.progressedCount).toBe(1);
    expect(dashboardA.progress.stages.find((stage) => stage.key === "interview")?.count).toBe(1);
    expect(dashboardA.progress.interviewRate).toBe(1);
    expect(dashboardA.progress.offerRate).toBe(0);
    expect((await listApplicationsForUser(userA.id, { status: "ACTIVE", page: 1, pageSize: 10 })).total).toBe(1);

    await createApplication(userA.id, { ...input, companyName: "AAA 测试公司", appliedAt: "2026-08-20", positions: [{ priority: 1, title: "后端工程师" }] });
    await createApplication(userA.id, { ...input, companyName: "ZZZ 测试公司", appliedAt: "2026-08-10", positions: [{ priority: 1, title: "数据工程师" }] });
    const byCompany = await listApplicationsForUser(userA.id, { sort: "companyName", direction: "asc", page: 1, pageSize: 10 });
    const byPosition = await listApplicationsForUser(userA.id, { sort: "position", direction: "asc", page: 1, pageSize: 10 });
    const byAppliedDate = await listApplicationsForUser(userA.id, { sort: "appliedAt", direction: "asc", page: 1, pageSize: 10 });
    const byLastActivity = await listApplicationsForUser(userA.id, { sort: "lastActivityAt", direction: "desc", page: 1, pageSize: 10 });
    const byInactiveDays = await listApplicationsForUser(userA.id, { sort: "inactive", direction: "desc", page: 1, pageSize: 10 });
    expect(byCompany.items[0].companyName).toBe("AAA 测试公司");
    expect(byPosition.items[0].positions[0].title).toBe("后端工程师");
    expect(byAppliedDate.items[0].companyName).toBe("测试公司 A");
    expect(byLastActivity.items[0].companyName).toBe("测试公司 A");
    expect(byInactiveDays.items[0].companyName).toBe("测试公司 A");
  }, 15_000);

  it("同一用户同名公司共享分类和收藏，分类筛选、重命名与删除均不影响投递", async () => {
    const category = await createCategoryForUser(userA.id, { name: `分类-${stamp}`, color: "violet" });
    const first = await createApplication(userA.id, { ...input, companyName: "  同步  公司  ", companyCategoryId: category.id, isCompanyFavorite: true });
    const second = await createApplication(userA.id, { ...input, companyName: "同步 公司", applicationUrl: "https://example.com/shared", positions: [{ priority: 1, title: "后端工程师" }] });
    expect(first.companyId).toBe(second.companyId);
    expect(second.companyCategory?.id).toBe(category.id);
    expect(second.isCompanyFavorite).toBe(true);
    expect((await listApplicationsForUser(userA.id, { favorite: true, categoryId: category.id, page: 1, pageSize: 20 })).items.filter((item) => item.companyId === first.companyId)).toHaveLength(2);
    expect(await updateCompanyForUser(userB.id, first.companyId, { isFavorite: false })).toBeNull();
    const renamed = await renameCategoryForUser(userA.id, category.id, { name: `重命名-${stamp}`, color: "emerald" });
    expect(renamed?.name).toBe(`重命名-${stamp}`);
    expect((await getApplicationForUser(userA.id, first.id))?.companyCategory?.name).toBe(`重命名-${stamp}`);
    const deleted = await deleteCategoryForUser(userA.id, category.id);
    expect(deleted?.affectedCompanyCount).toBe(1);
    const afterDelete = await getApplicationForUser(userA.id, second.id);
    expect(afterDelete?.companyCategory).toBeNull();
    expect(afterDelete?.isCompanyFavorite).toBe(true);
  }, 15_000);
});
