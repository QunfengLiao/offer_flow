import { ApplicationStatus, EventType, Prisma } from "@prisma/client";
import { addMonths, addWeeks, addYears, differenceInCalendarDays, endOfDay, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subWeeks, subYears } from "date-fns";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { isTerminalStatus, STATUS_LABELS } from "./constants";
import { getInactiveDays, getReminderLevel, toDateOnlyAtNoon } from "./date";
import { applicationImportRowSchema, type ApplicationImportInput, type ApplicationInput, type UpdateApplicationInput } from "./validations";
import { APPLICATION_IMPORT_FIELD_LABELS } from "./application-import";

const applicationInclude = {
  company: { include: { category: true } },
  positions: { orderBy: { priority: "asc" as const } },
  events: { orderBy: { occurredAt: "desc" as const } },
} satisfies Prisma.JobApplicationInclude;

// Keep list payloads focused: history is fetched only when the detail drawer opens.
const applicationListInclude = {
  company: { include: { category: true } },
  positions: { orderBy: { priority: "asc" as const } },
} satisfies Prisma.JobApplicationInclude;

type ApplicationWithDetails = Prisma.JobApplicationGetPayload<{ include: typeof applicationInclude }>;
type ApplicationListWithDetails = Prisma.JobApplicationGetPayload<{ include: typeof applicationListInclude }>;

export type ApplicationDto = {
  id: string;
  companyId: string;
  companyName: string;
  companyCategory: { id: string; name: string; color: string } | null;
  isCompanyFavorite: boolean;
  applicationUrl: string;
  appliedAt: string;
  currentStatus: ApplicationStatus;
  currentStatusLabel: string;
  lastActivityAt: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  inactiveDays: number;
  reminderLevel: "normal" | "warning" | "danger";
  positions: { id: string; priority: number; title: string }[];
  events: {
    id: string;
    type: EventType;
    typeLabel: string;
    fromStatus: ApplicationStatus | null;
    fromStatusLabel: string | null;
    toStatus: ApplicationStatus | null;
    toStatusLabel: string | null;
    description: string | null;
    occurredAt: string;
  }[];
};

export type ApplicationStatusFilter = ApplicationStatus | "ACTIVE";

export type DashboardProgress = {
  stages: {
    key: "applied" | "assessment" | "interview" | "offer";
    label: string;
    count: number;
    conversionRate: number | null;
    overallRate: number | null;
  }[];
  progressedCount: number;
  interviewCount: number;
  offerCount: number;
  rejectedCount: number;
  interviewRate: number | null;
  offerRate: number | null;
  rejectedRate: number | null;
  weeklyTrend: { key: string; label: string; count: number }[];
};

export type DashboardTrendPoint = { key: string; label: string; count: number; start: string; end: string };

export type DashboardAnalytics = {
  statusDistribution: { status: ApplicationStatus; label: string; count: number }[];
  trends: { week: DashboardTrendPoint[]; month: DashboardTrendPoint[]; year: DashboardTrendPoint[] };
  categoryDistribution: { categoryId: string | "UNCATEGORIZED"; label: string; count: number }[];
};

function serializeApplication(application: ApplicationWithDetails | ApplicationListWithDetails): ApplicationDto {
  const inactiveDays = getInactiveDays(application.appliedAt);
  return {
    id: application.id,
    companyId: application.companyId,
    companyName: application.company.name,
    companyCategory: application.company.category ? { id: application.company.category.id, name: application.company.category.name, color: application.company.category.color } : null,
    isCompanyFavorite: application.company.isFavorite,
    applicationUrl: application.applicationUrl,
    appliedAt: application.appliedAt.toISOString(),
    currentStatus: application.currentStatus,
    currentStatusLabel: STATUS_LABELS[application.currentStatus],
    lastActivityAt: application.lastActivityAt.toISOString(),
    note: application.note,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    inactiveDays,
    reminderLevel: getReminderLevel(inactiveDays, application.currentStatus),
    positions: application.positions.map((position) => ({ id: position.id, priority: position.priority, title: position.title })),
    events: ("events" in application ? application.events : []).map((event) => ({
      id: event.id,
      type: event.type,
      typeLabel: event.type === EventType.STATUS_CHANGE ? "状态变更" : "普通动态",
      fromStatus: event.fromStatus,
      fromStatusLabel: event.fromStatus ? STATUS_LABELS[event.fromStatus] : null,
      toStatus: event.toStatus,
      toStatusLabel: event.toStatus ? STATUS_LABELS[event.toStatus] : null,
      description: event.description,
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

function positionCreateData(input: ApplicationInput | UpdateApplicationInput) {
  return input.positions.map((position) => ({ priority: position.priority, title: position.title }));
}

export function normalizeCompanyName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function displayCompanyName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

async function resolveCompanyForInput(tx: Prisma.TransactionClient, userId: string, input: ApplicationInput | UpdateApplicationInput) {
  const normalizedName = normalizeCompanyName(input.companyName);
  const categoryId = input.companyCategoryId;
  if (categoryId) {
    const category = await tx.companyCategory.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
    if (!category) throw new Error("INVALID_CATEGORY");
  }
  const existing = await tx.company.findUnique({ where: { userId_normalizedName: { userId, normalizedName } } });
  if (existing) {
    const data: Prisma.CompanyUpdateInput = {};
    if (categoryId !== undefined) data.category = categoryId ? { connect: { id: categoryId } } : { disconnect: true };
    if (input.isCompanyFavorite !== undefined) data.isFavorite = input.isCompanyFavorite;
    return Object.keys(data).length ? tx.company.update({ where: { id: existing.id }, data }) : existing;
  }
  return tx.company.create({
    data: {
      userId,
      name: displayCompanyName(input.companyName),
      normalizedName,
      ...(categoryId ? { categoryId } : {}),
      isFavorite: input.isCompanyFavorite ?? false,
    },
  });
}

export async function createApplication(userId: string, input: ApplicationInput) {
  const appliedAt = toDateOnlyAtNoon(input.appliedAt);
  const created = await prisma.$transaction(async (tx) => {
    const company = await resolveCompanyForInput(tx, userId, input);
    return tx.jobApplication.create({ data: {
      userId, companyId: company.id, companyName: company.name,
      applicationUrl: input.applicationUrl,
       appliedAt,
       lastActivityAt: appliedAt,
       statusPriority: statusPriorityOrder[ApplicationStatus.APPLIED],
       primaryPositionTitle: primaryPositionTitle(input),
      note: input.note || null,
      currentStatus: ApplicationStatus.APPLIED,
      positions: { create: positionCreateData(input) },
      events: {
        create: {
          type: EventType.STATUS_CHANGE,
          fromStatus: null,
          toStatus: ApplicationStatus.APPLIED,
          description: "完成投递",
          occurredAt: appliedAt,
        },
      },
    },
    include: applicationInclude,
    });
  });
  return serializeApplication(created);
}

export type ApplicationImportError = { rowNumber: number; field: string; reason: string };
type ApplicationImportRequestRow = { rowNumber?: unknown; values?: unknown };

function importRowNumber(row: ApplicationImportRequestRow, index: number) {
  return typeof row.rowNumber === "number" && Number.isInteger(row.rowNumber) && row.rowNumber >= 2 ? row.rowNumber : index + 2;
}

function importIssue(rowNumber: number, path: PropertyKey[], reason: string): ApplicationImportError {
  const field = String(path[0] ?? "整行");
  return { rowNumber, field: APPLICATION_IMPORT_FIELD_LABELS[field as keyof typeof APPLICATION_IMPORT_FIELD_LABELS] ?? field, reason };
}

function importCompanyKey(name: string) {
  return normalizeCompanyName(name);
}

export async function importApplicationsForUser(userId: string, rows: unknown[]) {
  const errors: ApplicationImportError[] = [];
  const invalidRowNumbers = new Set<number>();
  const parsedRows: { rowNumber: number; input: ApplicationImportInput }[] = [];

  rows.forEach((candidate, index) => {
    const row = candidate && typeof candidate === "object" ? candidate as ApplicationImportRequestRow : {};
    const rowNumber = importRowNumber(row, index);
    const result = applicationImportRowSchema.safeParse("values" in row ? row.values : candidate);
    if (!result.success) {
      invalidRowNumbers.add(rowNumber);
      result.error.issues.forEach((issue) => errors.push(importIssue(rowNumber, issue.path, issue.message)));
      return;
    }
    parsedRows.push({ rowNumber, input: result.data });
  });

  const categoryNames = [...new Set(parsedRows.map(({ input }) => input.companyCategoryName).filter((name): name is string => Boolean(name)))];
  const categories = categoryNames.length
    ? await prisma.companyCategory.findMany({ where: { userId, name: { in: categoryNames } }, select: { id: true, name: true } })
    : [];
  const categoryByName = new Map(categories.map((category) => [category.name, category.id]));
  const validRows = parsedRows.filter(({ rowNumber, input }) => {
    if (input.companyCategoryName && !categoryByName.has(input.companyCategoryName)) {
      invalidRowNumbers.add(rowNumber);
      errors.push({ rowNumber, field: "公司分类", reason: `分类“${input.companyCategoryName}”不存在，请先在系统中创建` });
      return false;
    }
    return true;
  });

  if (validRows.length > 0) {
    await prisma.$transaction(async (tx) => {
      const companyByName = new Map<string, { id: string; name: string; categoryId: string | null }>();
      const companyInputs = new Map<string, { input: ApplicationImportInput; categoryId?: string }>();
      validRows.forEach(({ input }) => {
        companyInputs.set(importCompanyKey(input.companyName), { input, categoryId: input.companyCategoryName ? categoryByName.get(input.companyCategoryName) : undefined });
      });
      const normalizedNames = [...companyInputs.keys()];
      const existingCompanies = await tx.company.findMany({ where: { userId, normalizedName: { in: normalizedNames } } });
      existingCompanies.forEach((company) => companyByName.set(company.normalizedName, company));

      const newCompanies = [...companyInputs.entries()].filter(([normalizedName]) => !companyByName.has(normalizedName));
      if (newCompanies.length > 0) {
        await tx.company.createMany({
          data: newCompanies.map(([normalizedName, { input, categoryId }]) => ({
            userId,
            name: displayCompanyName(input.companyName),
            normalizedName,
            categoryId: categoryId ?? null,
          })),
          skipDuplicates: true,
        });
      }

      const allCompanies = await tx.company.findMany({ where: { userId, normalizedName: { in: normalizedNames } } });
      allCompanies.forEach((company) => companyByName.set(company.normalizedName, company));

      const companyUpdateGroups = new Map<string, { ids: string[]; data: Prisma.CompanyUncheckedUpdateManyInput }>();
      companyInputs.forEach(({ categoryId }, normalizedName) => {
        const company = companyByName.get(normalizedName);
        if (!company) throw new Error("IMPORT_COMPANY_RESOLUTION_FAILED");
        const data: Prisma.CompanyUncheckedUpdateManyInput = {};
        if (categoryId !== undefined) data.categoryId = categoryId;
        if (Object.keys(data).length === 0) return;
        const key = categoryId ?? "keep";
        const group = companyUpdateGroups.get(key) ?? { ids: [], data };
        group.ids.push(company.id);
        companyUpdateGroups.set(key, group);
      });
      for (const group of companyUpdateGroups.values()) {
        await tx.company.updateMany({ where: { userId, id: { in: group.ids } }, data: group.data });
      }

      if (companyUpdateGroups.size > 0) {
        const updatedCompanies = await tx.company.findMany({ where: { userId, normalizedName: { in: normalizedNames } } });
        updatedCompanies.forEach((company) => companyByName.set(company.normalizedName, company));
      }

      const applicationRows = validRows.map(({ input }) => {
        const company = companyByName.get(importCompanyKey(input.companyName));
        if (!company) throw new Error("IMPORT_COMPANY_RESOLUTION_FAILED");
        const id = randomUUID();
        const appliedAt = toDateOnlyAtNoon(input.appliedAt);
        return {
          id,
          userId,
          companyId: company.id,
          companyName: company.name,
          applicationUrl: input.applicationUrl,
          appliedAt,
          currentStatus: input.currentStatus,
          statusPriority: statusPriorityOrder[input.currentStatus],
          primaryPositionTitle: input.positions[0]?.title ?? "",
          lastActivityAt: appliedAt,
          note: input.note ?? null,
        };
      });
      await tx.jobApplication.createMany({ data: applicationRows });
      await tx.applicationPosition.createMany({
        data: validRows.flatMap(({ input }, index) => input.positions.map((position) => ({ id: randomUUID(), applicationId: applicationRows[index].id, priority: position.priority, title: position.title }))),
      });
      await tx.applicationEvent.createMany({
        data: validRows.map(({ input }, index) => ({
          id: randomUUID(),
          applicationId: applicationRows[index].id,
          type: EventType.STATUS_CHANGE,
          fromStatus: null,
          toStatus: input.currentStatus,
          description: input.currentStatus === ApplicationStatus.APPLIED ? "完成投递" : `导入初始状态：${STATUS_LABELS[input.currentStatus]}`,
          occurredAt: applicationRows[index].appliedAt,
        })),
      });
    });
  }

  return {
    successCount: validRows.length,
    failureCount: invalidRowNumbers.size,
    errors,
  };
}

export async function getApplicationForUser(userId: string, id: string) {
  const application = await prisma.jobApplication.findFirst({ where: { id, userId }, include: applicationInclude });
  return application ? serializeApplication(application) : null;
}

type ListOptions = {
  query?: string;
  status?: ApplicationStatusFilter;
  attention?: boolean;
  favorite?: boolean;
  categoryId?: string | "UNCATEGORIZED";
  appliedFrom?: Date;
  appliedTo?: Date;
  sort?: ApplicationSort;
  direction?: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type ApplicationSort = "statusPriority" | "inactive" | "companyName" | "position" | "appliedAt" | "currentStatus" | "lastActivityAt";

const statusPriorityOrder: Record<ApplicationStatus, number> = {
  OFFER: 1,
  THIRD_INTERVIEW: 2,
  SECOND_INTERVIEW: 3,
  FIRST_INTERVIEW: 4,
  HR_INTERVIEW: 5,
  WRITTEN_TEST: 6,
  ASSESSMENT: 7,
  APPLIED: 8,
  CLOSED: 9,
  REJECTED: 10,
};

function primaryPositionTitle(input: ApplicationInput | UpdateApplicationInput) {
  return input.positions.find((position) => position.priority === 1)?.title ?? "";
}

export async function listApplicationsForUser(userId: string, options: ListOptions) {
  const activeStatusFilter = { notIn: [ApplicationStatus.OFFER, ApplicationStatus.REJECTED, ApplicationStatus.CLOSED] };
  let currentStatusFilter: ApplicationStatus | typeof activeStatusFilter | { in: ApplicationStatus[] } | undefined;
  if (options.attention) {
    if (!options.status || options.status === "ACTIVE") currentStatusFilter = activeStatusFilter;
    else currentStatusFilter = isTerminalStatus(options.status) ? { in: [] } : options.status;
  } else if (options.status) {
    currentStatusFilter = options.status === "ACTIVE" ? activeStatusFilter : options.status;
  }
  const where: Prisma.JobApplicationWhereInput = {
    userId,
    ...(options.query ? { OR: [{ company: { name: { contains: options.query } } }, { positions: { some: { title: { contains: options.query } } } }] } : {}),
    ...(currentStatusFilter ? { currentStatus: currentStatusFilter } : {}),
    ...((options.appliedFrom || options.appliedTo || options.attention) ? { appliedAt: {
      ...(options.appliedFrom ? { gte: options.appliedFrom } : {}),
      ...(options.appliedTo ? { lt: options.appliedTo } : {}),
      ...(options.attention ? { lte: endOfDay(subDays(new Date(), 7)) } : {}),
    } } : {}),
    ...((options.favorite || options.categoryId) ? { company: {
      ...(options.favorite ? { isFavorite: true } : {}),
      ...(options.categoryId === "UNCATEGORIZED" ? { categoryId: null } : options.categoryId ? { categoryId: options.categoryId } : {}),
    } } : {}),
  };

  const direction = options.direction ?? "asc";
  // Keep every supported sort database-side. The previous implementation
  // omitted pagination for statusPriority/position and sorted all matches in
  // Node, making the first page as expensive as the entire result set.
  const orderBy: Prisma.JobApplicationOrderByWithRelationInput[] = options.sort === "companyName"
    ? [{ company: { name: direction } }, { id: "asc" }]
    : options.sort === "position"
      ? [{ primaryPositionTitle: direction }, { companyName: "asc" }, { id: "asc" }]
    : options.sort === "statusPriority"
      ? [{ statusPriority: direction }, { appliedAt: "desc" }, { companyName: "asc" }, { id: "asc" }]
    : options.sort === "currentStatus"
      ? [{ currentStatus: direction }, { id: "asc" }]
    : options.sort === "appliedAt"
      ? [{ appliedAt: direction }, { id: "asc" }]
    : options.sort === "inactive"
      ? [{ appliedAt: direction === "asc" ? "desc" : "asc" }, { id: "asc" }]
    : options.sort === "lastActivityAt"
      ? [{ lastActivityAt: direction }, { id: "asc" }]
      : [{ statusPriority: "asc" }, { appliedAt: "desc" }, { companyName: "asc" }, { id: "asc" }];

  // The count and page do not require write consistency. Run them in parallel so
  // a remote database does not pay transaction begin/commit and serial round trips.
  const applicationsQuery = prisma.jobApplication.findMany({
    where,
    orderBy,
    skip: (options.page - 1) * options.pageSize,
    take: options.pageSize,
    include: applicationListInclude,
  });
  const [total, applications, favoriteCompanyCount] = await Promise.all([
    prisma.jobApplication.count({ where }),
    applicationsQuery,
    prisma.company.count({ where: { userId, isFavorite: true, applications: { some: where } } }),
  ]);

  const items = applications.map(serializeApplication);
  return { items, total, favoriteCompanyCount, page: options.page, pageSize: options.pageSize, pageCount: Math.max(1, Math.ceil(total / options.pageSize)) };
}

export async function updateApplicationForUser(userId: string, id: string, input: UpdateApplicationInput) {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.jobApplication.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const nextStatus = input.currentStatus as ApplicationStatus | undefined;
    const statusChanged = nextStatus !== undefined && nextStatus !== existing.currentStatus;
    const now = new Date();
    const company = await resolveCompanyForInput(tx, userId, input);
    const application = await tx.jobApplication.update({
      where: { id: existing.id },
      data: {
        companyId: company.id,
        companyName: company.name,
        applicationUrl: input.applicationUrl,
        appliedAt: toDateOnlyAtNoon(input.appliedAt),
        statusPriority: statusPriorityOrder[nextStatus ?? existing.currentStatus],
        primaryPositionTitle: primaryPositionTitle(input),
        note: input.note || null,
        ...(statusChanged ? { currentStatus: nextStatus, lastActivityAt: now } : {}),
        positions: {
          deleteMany: {},
          create: positionCreateData(input),
        },
      },
      include: applicationInclude,
    });
    if (statusChanged) {
      await tx.applicationEvent.create({
        data: {
          applicationId: existing.id,
          type: EventType.STATUS_CHANGE,
          fromStatus: existing.currentStatus,
          toStatus: nextStatus,
          description: input.eventDescription || `状态更新为${STATUS_LABELS[nextStatus!]}`,
        },
      });
    }
    return application;
  });
  return updated ? getApplicationForUser(userId, id) : null;
}

export async function addApplicationNoteForUser(userId: string, id: string, description: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.jobApplication.findFirst({ where: { id, userId } });
    if (!existing) return null;
    await tx.jobApplication.update({ where: { id: existing.id }, data: { lastActivityAt: new Date() } });
    await tx.applicationEvent.create({ data: { applicationId: existing.id, type: EventType.NOTE, description } });
    return true;
  });
  return updated ? getApplicationForUser(userId, id) : null;
}

export async function deleteApplicationForUser(userId: string, id: string) {
  const result = await prisma.jobApplication.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

type DashboardCategorySummary = { category: { id: string; name: string } | null; _count: { applications: number } };
type DashboardStatusCount = { currentStatus: ApplicationStatus; _count: { _all: number } };
type DashboardTrendCounts = { week: number[]; month: number[]; year: number[]; progressWeek: number[] };
type DashboardAggregate = {
  total: number;
  active: number;
  offers: number;
  rejected: number;
  attentionCount: number;
  assessmentCount: number;
  interviewCount: number;
  offerCount: number;
  progressedCount: number;
  statusCounts: DashboardStatusCount[];
};

type DateRange = { start: Date; end: Date };

function getDashboardRanges(now: Date) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const yearStart = startOfYear(now);
  return {
    week: Array.from({ length: 12 }, (_, index) => {
      const start = subWeeks(weekStart, 11 - index);
      return { start, end: addWeeks(start, 1) };
    }),
    month: Array.from({ length: 12 }, (_, index) => {
      const start = subMonths(monthStart, 11 - index);
      return { start, end: addMonths(start, 1) };
    }),
    year: Array.from({ length: 6 }, (_, index) => {
      const start = subYears(yearStart, 5 - index);
      return { start, end: addYears(start, 1) };
    }),
    progressWeek: Array.from({ length: 8 }, (_, index) => {
      const start = addWeeks(subWeeks(weekStart, 7), index);
      return { start, end: addWeeks(start, 1) };
    }),
  } satisfies Record<string, DateRange[]>;
}

async function getDashboardTrendCounts(userId: string, now: Date): Promise<DashboardTrendCounts> {
  const ranges = getDashboardRanges(now);
  const columns = Object.entries(ranges).flatMap(([group, groupRanges]) => groupRanges.map((range, index) => {
    const key = `${group}_${index}`;
    return Prisma.sql`COALESCE(SUM(CASE WHEN appliedAt >= ${range.start} AND appliedAt < ${range.end} AND appliedAt <= ${now} THEN 1 ELSE 0 END), 0) AS ${Prisma.raw(`\`${key}\``)}`;
  }));
  const [row] = await prisma.$queryRaw<Array<Record<string, bigint | number>>>(Prisma.sql`
    SELECT ${Prisma.join(columns, ", ")}
    FROM JobApplication
    WHERE userId = ${userId}
  `);
  const read = (group: keyof DashboardTrendCounts) => ranges[group === "progressWeek" ? "progressWeek" : group].map((_, index) => Number(row?.[`${group}_${index}`] ?? 0));
  return { week: read("week"), month: read("month"), year: read("year"), progressWeek: read("progressWeek") };
}

function statusSqlList(statuses: ApplicationStatus[]) {
  return Prisma.join(statuses.map((status) => Prisma.sql`${status}`), ", ");
}

async function getDashboardAggregate(userId: string, now: Date): Promise<DashboardAggregate> {
  const terminalStatuses: ApplicationStatus[] = [ApplicationStatus.OFFER, ApplicationStatus.REJECTED, ApplicationStatus.CLOSED];
  const assessmentStatuses: ApplicationStatus[] = [ApplicationStatus.ASSESSMENT, ApplicationStatus.WRITTEN_TEST];
  const interviewStatuses: ApplicationStatus[] = [ApplicationStatus.FIRST_INTERVIEW, ApplicationStatus.SECOND_INTERVIEW, ApplicationStatus.THIRD_INTERVIEW, ApplicationStatus.HR_INTERVIEW];
  const progressedStatuses: ApplicationStatus[] = [...assessmentStatuses, ...interviewStatuses, ApplicationStatus.OFFER];
  const attentionDeadline = endOfDay(subDays(now, 7));
  const reachedExpression = (statuses: ApplicationStatus[]) => Prisma.sql`(
    currentStatus IN (${statusSqlList(statuses)})
    OR EXISTS (
      SELECT 1 FROM ApplicationEvent AS event
      WHERE event.applicationId = application.id
        AND event.toStatus IN (${statusSqlList(statuses)})
    )
  )`;
  const statusColumns = Object.values(ApplicationStatus).map((status) => Prisma.sql`SUM(currentStatus = ${status}) AS ${Prisma.raw(`\`status_${status}\``)}`);
  const [row] = await prisma.$queryRaw<Array<Record<string, bigint | number>>>(Prisma.sql`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(currentStatus NOT IN (${statusSqlList(terminalStatuses)})), 0) AS active,
      COALESCE(SUM(currentStatus = ${ApplicationStatus.OFFER}), 0) AS offers,
      COALESCE(SUM(currentStatus = ${ApplicationStatus.REJECTED}), 0) AS rejected,
      COALESCE(SUM(currentStatus NOT IN (${statusSqlList(terminalStatuses)}) AND appliedAt <= ${attentionDeadline}), 0) AS attentionCount,
      COALESCE(SUM(${reachedExpression(assessmentStatuses)}), 0) AS assessmentCount,
      COALESCE(SUM(${reachedExpression(interviewStatuses)}), 0) AS interviewCount,
      COALESCE(SUM(${reachedExpression([ApplicationStatus.OFFER])}), 0) AS offerCount,
      COALESCE(SUM(${reachedExpression(progressedStatuses)}), 0) AS progressedCount,
      ${Prisma.join(statusColumns, ", ")}
    FROM JobApplication AS application
    WHERE userId = ${userId}
  `);
  const read = (key: string) => Number(row?.[key] ?? 0);
  return {
    total: read("total"),
    active: read("active"),
    offers: read("offers"),
    rejected: read("rejected"),
    attentionCount: read("attentionCount"),
    assessmentCount: read("assessmentCount"),
    interviewCount: read("interviewCount"),
    offerCount: read("offerCount"),
    progressedCount: read("progressedCount"),
    statusCounts: Object.values(ApplicationStatus).map((status) => ({ currentStatus: status, _count: { _all: read(`status_${status}`) } })),
  };
}

export async function getDashboardForUser(userId: string) {
  const now = new Date();
  const terminalStatuses: ApplicationStatus[] = [ApplicationStatus.OFFER, ApplicationStatus.REJECTED, ApplicationStatus.CLOSED];
  const attentionWhere: Prisma.JobApplicationWhereInput = {
    userId,
    currentStatus: { notIn: terminalStatuses },
    appliedAt: { lte: endOfDay(subDays(now, 7)) },
  };

  // Dashboard reads are aggregate-first. The old implementation loaded every
  // note, position, and event before doing all aggregation in Node, which made
  // the response grow with history size and made every page open expensive.
  const [aggregate, attentionApplications, favoriteCompanyCount, trendCounts, categorySummaries] = await Promise.all([
    getDashboardAggregate(userId, now),
    prisma.jobApplication.findMany({ where: attentionWhere, orderBy: { appliedAt: "asc" }, take: 5, include: applicationInclude }),
    prisma.company.count({ where: { userId, isFavorite: true } }),
    getDashboardTrendCounts(userId, now),
    prisma.company.findMany({
      where: { userId },
      select: { category: { select: { id: true, name: true } }, _count: { select: { applications: true } } },
    }),
  ]);
  const progress = buildDashboardProgress({ total: aggregate.total, assessmentCount: aggregate.assessmentCount, interviewCount: aggregate.interviewCount, offerCount: aggregate.offerCount, rejected: aggregate.rejected, progressedCount: aggregate.progressedCount }, trendCounts, now);
  const analytics = buildDashboardAnalytics(aggregate.statusCounts, trendCounts, categorySummaries, now);
  return {
    total: aggregate.total,
    active: aggregate.active,
    offers: aggregate.offers,
    rejected: aggregate.rejected,
    attentionCount: aggregate.attentionCount,
    favoriteCompanyCount,
    attention: attentionApplications.map(serializeApplication),
    progress,
    analytics,
  };
}

function buildDashboardAnalytics(statusCounts: DashboardStatusCount[], trendCounts: DashboardTrendCounts, categorySummaries: DashboardCategorySummary[], now: Date): DashboardAnalytics {
  const countByStatus = new Map(statusCounts.map((item) => [item.currentStatus, item._count._all]));
  const statusDistribution = Object.values(ApplicationStatus).map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: countByStatus.get(status) ?? 0,
  }));
  const formatMonthLabel = (date: Date) => date.getFullYear() === now.getFullYear() ? `${date.getMonth() + 1}月` : `${String(date.getFullYear()).slice(-2)}年${date.getMonth() + 1}月`;
  const formatWeekLabel = (date: Date) => date.getFullYear() === now.getFullYear() ? `${date.getMonth() + 1}/${date.getDate()}` : `${String(date.getFullYear()).slice(-2)}年${date.getMonth() + 1}/${date.getDate()}`;
  const ranges = getDashboardRanges(now);
  const trends = {
    week: ranges.week.map((range, index) => ({ key: range.start.toISOString(), label: formatWeekLabel(range.start), count: trendCounts.week[index] ?? 0, start: range.start.toISOString(), end: range.end.toISOString() })),
    month: ranges.month.map((range, index) => ({ key: range.start.toISOString(), label: formatMonthLabel(range.start), count: trendCounts.month[index] ?? 0, start: range.start.toISOString(), end: range.end.toISOString() })),
    year: ranges.year.map((range, index) => ({ key: range.start.toISOString(), label: `${range.start.getFullYear()}年`, count: trendCounts.year[index] ?? 0, start: range.start.toISOString(), end: range.end.toISOString() })),
  };
  const categoryCounts = new Map<string, { categoryId: string | "UNCATEGORIZED"; label: string; count: number }>();
  categorySummaries.forEach((company) => {
    if (company._count.applications === 0) return;
    const categoryId = company.category?.id ?? "UNCATEGORIZED";
    const label = company.category?.name ?? "未分类";
    const current = categoryCounts.get(categoryId) ?? { categoryId, label, count: 0 };
    current.count += company._count.applications;
    categoryCounts.set(categoryId, current);
  });
  return {
    statusDistribution,
    trends,
    categoryDistribution: [...categoryCounts.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN")),
  };
}

function buildDashboardProgress(counts: { total: number; assessmentCount: number; interviewCount: number; offerCount: number; rejected: number; progressedCount: number }, trendCounts: DashboardTrendCounts, now: Date): DashboardProgress {
  const weeklyRanges = getDashboardRanges(now).progressWeek;
  const stageDefinitions: DashboardProgress["stages"] = [
    { key: "applied", label: "投递", count: counts.total, conversionRate: null, overallRate: ratio(counts.total, counts.total) },
    { key: "assessment", label: "测评 / 笔试", count: counts.assessmentCount, conversionRate: ratio(counts.assessmentCount, counts.total), overallRate: ratio(counts.assessmentCount, counts.total) },
    { key: "interview", label: "面试", count: counts.interviewCount, conversionRate: ratio(counts.interviewCount, counts.assessmentCount), overallRate: ratio(counts.interviewCount, counts.total) },
    { key: "offer", label: "Offer", count: counts.offerCount, conversionRate: ratio(counts.offerCount, counts.interviewCount), overallRate: ratio(counts.offerCount, counts.total) },
  ];
  const weeklyTrend = weeklyRanges.map((range, index) => ({ key: range.start.toISOString(), label: `${range.start.getMonth() + 1}/${range.start.getDate()}`, count: trendCounts.progressWeek[index] ?? 0 }));
  return {
    stages: stageDefinitions,
    progressedCount: counts.progressedCount,
    interviewCount: counts.interviewCount,
    offerCount: counts.offerCount,
    rejectedCount: counts.rejected,
    interviewRate: ratio(counts.interviewCount, counts.total),
    offerRate: ratio(counts.offerCount, counts.total),
    rejectedRate: ratio(counts.rejected, counts.total),
    weeklyTrend,
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function isInactiveByCalendarDays(appliedAt: Date, today: Date, minimumDays: number) {
  return differenceInCalendarDays(today, appliedAt) >= minimumDays;
}

export function isTerminal(status: ApplicationStatus) {
  return isTerminalStatus(status);
}
