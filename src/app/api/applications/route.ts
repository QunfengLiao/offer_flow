import { ApplicationStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { createApplication, listApplicationsForUser, type ApplicationSort, type ApplicationStatusFilter } from "@/lib/application-service";
import { applicationSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") || 10)));
    const statusValue = searchParams.get("status");
    const status = statusValue === "ACTIVE"
      ? "ACTIVE"
      : statusValue && Object.values(ApplicationStatus).includes(statusValue as ApplicationStatus)
        ? statusValue as ApplicationStatus
        : undefined;
    const sortValue = searchParams.get("sort");
    const sort = ["statusPriority", "inactive", "companyName", "position", "appliedAt", "currentStatus", "lastActivityAt"].includes(sortValue || "")
      ? sortValue as ApplicationSort
      : "inactive";
    const direction = searchParams.get("direction") === "desc" ? "desc" : "asc";
    const result = await listApplicationsForUser(user.id, {
      query: searchParams.get("query")?.trim() || undefined,
      status: status as ApplicationStatusFilter | undefined,
      attention: searchParams.get("attention") === "true",
      favorite: searchParams.get("favorite") === "true",
      categoryId: searchParams.get("categoryId") === "UNCATEGORIZED" ? "UNCATEGORIZED" : searchParams.get("categoryId")?.trim() || undefined,
      sort,
      direction,
      page,
      pageSize,
    });
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = applicationSchema.parse(await request.json());
    const application = await createApplication(user.id, input);
    return ok(application, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
