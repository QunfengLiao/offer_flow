import { requireUser } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { findCompanyForUser } from "@/lib/company-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const name = new URL(request.url).searchParams.get("name") ?? "";
    return ok(await findCompanyForUser(user.id, name));
  } catch (error) {
    return errorResponse(error);
  }
}
