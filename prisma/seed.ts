import { PrismaClient, ApplicationStatus, EventType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const demoApplications = [
  {
    companyName: "星河科技",
    applicationUrl: "https://example.com/jobs/galaxy",
    appliedDaysAgo: 16,
    inactiveDaysAgo: 10,
    currentStatus: ApplicationStatus.FIRST_INTERVIEW,
    positions: ["前端工程师", "全栈工程师"],
    note: "关注业务中台与工程效率方向。",
  },
  {
    companyName: "远川物流",
    applicationUrl: "https://example.com/jobs/yuanchuan",
    appliedDaysAgo: 8,
    inactiveDaysAgo: 2,
    currentStatus: ApplicationStatus.ASSESSMENT,
    positions: ["产品运营"],
    note: "测评截止周五。",
  },
  {
    companyName: "澄明消费",
    applicationUrl: "https://example.com/jobs/chengming",
    appliedDaysAgo: 20,
    inactiveDaysAgo: 20,
    currentStatus: ApplicationStatus.OFFER,
    positions: ["数据分析师", "商业分析师"],
    note: "已收到口头 Offer。",
  },
];

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("演示数据 seed 默认关闭。本项目不需要 seed；如需创建独立演示账号，请显式设置 ALLOW_DEMO_SEED=true。现有账号和投递不会被修改。");
  }

  const email = process.env.SEED_EMAIL ?? "demo@example.com";
  const password = process.env.SEED_PASSWORD ?? "DemoPass123!";
  const username = process.env.SEED_USERNAME ?? "Demo User";
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error(`拒绝写入已存在的账号 ${email}。请使用一个全新的 SEED_EMAIL，避免触碰已有数据。`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, username, passwordHash } });
    for (const [index, item] of demoApplications.entries()) {
      const sequence = String(index + 1).padStart(3, "0");
      const applicationId = `seed-app-${sequence}`;
      const companyId = `seed-company-${sequence}`;
      const appliedAt = new Date(now.getTime() - item.appliedDaysAgo * 86400000);
      const lastActivityAt = new Date(now.getTime() - item.inactiveDaysAgo * 86400000);
      await tx.company.create({
        data: { id: companyId, userId: user.id, name: item.companyName, normalizedName: item.companyName.toLowerCase() },
      });
      await tx.jobApplication.create({
        data: {
          id: applicationId,
          userId: user.id,
          companyId,
          companyName: item.companyName,
          applicationUrl: item.applicationUrl,
          appliedAt,
          currentStatus: item.currentStatus,
          lastActivityAt,
          note: item.note,
          positions: { create: item.positions.map((title, positionIndex) => ({ id: `${applicationId}-position-${positionIndex + 1}`, title, priority: positionIndex + 1 })) },
          events: { create: { id: `${applicationId}-event-created`, type: EventType.STATUS_CHANGE, toStatus: ApplicationStatus.APPLIED, description: "完成网申", occurredAt: appliedAt } },
        },
      });
    }
  });

  console.log(`Created a separate demo account ${email} with ${demoApplications.length} applications.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
