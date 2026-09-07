import { requireUser } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { getDashboardForUser } from "@/lib/application-service";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getDashboardForUser(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
