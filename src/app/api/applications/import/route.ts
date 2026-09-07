import { requireUser } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { importApplicationsForUser } from "@/lib/application-service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as { rows?: unknown };
    if (!Array.isArray(body.rows)) throw new Error("INVALID_IMPORT_PAYLOAD");
    return ok(await importApplicationsForUser(user.id, body.rows));
  } catch (error) {
    return errorResponse(error);
  }
}
