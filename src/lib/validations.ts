import { z } from "zod";
import { ApplicationStatus } from "@prisma/client";
import { MAX_APPLICATION_POSITIONS, STATUS_LABELS } from "./constants";

const statusEnum = z.enum(Object.values(ApplicationStatus) as [string, ...string[]]);

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱地址"),
  username: z.string().trim().min(2, "用户名至少需要 2 个字符").max(40, "用户名不能超过 40 个字符"),
  password: z.string().min(8, "密码至少需要 8 个字符").max(72, "密码不能超过 72 个字符"),
  confirmPassword: z.string().min(1, "请再次输入密码"),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"], message: "两次输入的密码不一致",
});

const positionsSchema = z.array(z.object({
  priority: z.coerce.number().int().min(1).max(MAX_APPLICATION_POSITIONS, `志愿优先级只能是 1 到 ${MAX_APPLICATION_POSITIONS}`),
  title: z.string().trim().min(1, "职位名称不能为空").max(100, "职位名称不能超过 100 个字符"),
})).min(1, "至少填写第一志愿").max(MAX_APPLICATION_POSITIONS, `最多填写 ${MAX_APPLICATION_POSITIONS} 个志愿`).superRefine((positions, ctx) => {
  const priorities = positions.map((position) => position.priority);
  if (new Set(priorities).size !== priorities.length) {
    ctx.addIssue({ code: "custom", message: "志愿优先级不能重复", path: ["0", "priority"] });
  }
  if (!priorities.includes(1)) {
    ctx.addIssue({ code: "custom", message: "第一志愿不能为空", path: ["0", "title"] });
  }
});

export const applicationSchema = z.object({
  companyName: z.string().trim().min(1, "公司名称不能为空").max(100),
  companyCategoryId: z.string().trim().min(1).nullable().optional(),
  isCompanyFavorite: z.boolean().optional(),
  applicationUrl: z.string().trim().url("请输入合法的投递链接"),
  appliedAt: z.string().trim().min(1, "投递日期不能为空").regex(/^\d{4}-\d{2}-\d{2}$/, "投递日期格式不正确").refine((value) => {
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "请输入有效的投递日期"),
  positions: positionsSchema,
  note: z.string().trim().max(2000, "备注不能超过 2000 个字符").optional().nullable(),
});

const importText = z.string().trim();
const importStatus = importText
  .refine((value) => !value || Object.values(ApplicationStatus).includes(value as ApplicationStatus) || Object.values(STATUS_LABELS).includes(value), "当前状态必须填写有效的状态名称")
  .transform((value) => Object.values(ApplicationStatus).find((status) => status === value) ?? Object.entries(STATUS_LABELS).find(([, label]) => label === value)?.[0] as ApplicationStatus ?? ApplicationStatus.APPLIED);
const importPosition = importText.max(100, "职位名称不能超过 100 个字符");

export const applicationImportRowSchema = z.object({
  companyName: importText.min(1, "公司名称不能为空").max(100, "公司名称不能超过 100 个字符"),
  companyCategory: importText.max(20, "公司分类不能超过 20 个字符"),
  applicationUrl: importText.url("请输入合法的投递链接"),
  appliedAt: importText.min(1, "投递日期不能为空").regex(/^\d{4}-\d{2}-\d{2}$/, "投递日期格式应为 YYYY-MM-DD").refine((value) => {
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "请输入有效的投递日期"),
  currentStatus: importStatus,
  position1: importPosition.min(1, "第一志愿不能为空"),
  position2: importPosition,
  position3: importPosition,
  position4: importPosition,
  position5: importPosition,
  note: importText.max(2000, "备注不能超过 2000 个字符"),
}).transform((row) => ({
  companyName: row.companyName,
  companyCategoryName: row.companyCategory || undefined,
  applicationUrl: row.applicationUrl,
  appliedAt: row.appliedAt,
  currentStatus: row.currentStatus,
  positions: [row.position1, row.position2, row.position3, row.position4, row.position5]
    .map((title, index) => ({ priority: index + 1, title }))
    .filter((position) => position.title.length > 0),
  note: row.note || undefined,
}));

export const updateApplicationSchema = applicationSchema.extend({
  currentStatus: statusEnum.optional(),
  eventDescription: z.string().trim().max(500, "动态说明不能超过 500 个字符").optional(),
});

export const noteEventSchema = z.object({
  description: z.string().trim().min(1, "动态说明不能为空").max(500, "动态说明不能超过 500 个字符"),
});

export const statusChangeSchema = z.object({
  currentStatus: statusEnum,
  eventDescription: z.string().trim().max(500, "动态说明不能超过 500 个字符").optional(),
});

export const companyCategorySchema = z.object({
  name: z.string().trim().min(1, "分类名称不能为空").max(20, "分类名称不能超过 20 个字符"),
  color: z.enum(["blue", "cyan", "violet", "amber", "emerald", "slate"]),
});

export const updateCompanySchema = z.object({
  categoryId: z.string().trim().min(1).nullable().optional(),
  isFavorite: z.boolean().optional(),
}).refine((value) => value.categoryId !== undefined || value.isFavorite !== undefined, "至少提供一项公司信息");

export type ApplicationInput = z.infer<typeof applicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type ApplicationImportInput = z.infer<typeof applicationImportRowSchema>;
