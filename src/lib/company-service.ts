import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeCompanyName } from "./application-service";

export const DEFAULT_CATEGORIES = [
  { name: "车企", color: "blue" },
  { name: "互联网", color: "cyan" },
  { name: "网络安全", color: "violet" },
  { name: "物流", color: "amber" },
  { name: "游戏", color: "emerald" },
  { name: "制造业", color: "slate" },
] as const;

export type CompanyCategoryDto = { id: string; name: string; color: string; companyCount: number };
export type CompanyMetaDto = { id: string; name: string; categoryId: string | null; isFavorite: boolean };

function serializeCategory(category: { id: string; name: string; color: string; _count: { companies: number } }): CompanyCategoryDto {
  return { id: category.id, name: category.name, color: category.color, companyCount: category._count.companies };
}

export async function createDefaultCategoriesForUser(userId: string) {
  await prisma.$transaction(DEFAULT_CATEGORIES.map((category) => prisma.companyCategory.upsert({
    where: { userId_name: { userId, name: category.name } },
    update: {},
    create: { userId, ...category },
  })));
}

export async function listCategoriesForUser(userId: string) {
  const categories = await prisma.companyCategory.findMany({
    where: { userId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { companies: true } } },
  });
  return categories.map(serializeCategory);
}

export async function createCategoryForUser(userId: string, input: { name: string; color: string }) {
  const category = await prisma.companyCategory.create({ data: { userId, ...input }, include: { _count: { select: { companies: true } } } });
  return serializeCategory(category);
}

export async function renameCategoryForUser(userId: string, id: string, input: { name: string; color: string }) {
  const existing = await prisma.companyCategory.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return null;
  const category = await prisma.companyCategory.update({ where: { id }, data: input, include: { _count: { select: { companies: true } } } });
  return serializeCategory(category);
}

export async function deleteCategoryForUser(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.companyCategory.findFirst({ where: { id, userId }, include: { _count: { select: { companies: true } } } });
    if (!category) return null;
    await tx.companyCategory.delete({ where: { id } });
    return { affectedCompanyCount: category._count.companies };
  });
}

export async function findCompanyForUser(userId: string, name: string) {
  const normalizedName = normalizeCompanyName(name);
  if (!normalizedName) return null;
  const company = await prisma.company.findUnique({ where: { userId_normalizedName: { userId, normalizedName } }, select: { id: true, name: true, categoryId: true, isFavorite: true } });
  return company satisfies CompanyMetaDto | null;
}

export async function updateCompanyForUser(userId: string, id: string, input: { categoryId?: string | null; isFavorite?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findFirst({ where: { id, userId }, select: { id: true } });
    if (!company) return null;
    if (input.categoryId) {
      const category = await tx.companyCategory.findFirst({ where: { id: input.categoryId, userId }, select: { id: true } });
      if (!category) throw new Error("INVALID_CATEGORY");
    }
    const data: Prisma.CompanyUpdateInput = {};
    if (input.categoryId !== undefined) data.category = input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true };
    if (input.isFavorite !== undefined) data.isFavorite = input.isFavorite;
    const updated = await tx.company.update({ where: { id }, data, select: { id: true, name: true, categoryId: true, isFavorite: true } });
    return updated satisfies CompanyMetaDto;
  });
}
