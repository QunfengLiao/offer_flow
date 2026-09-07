import { requireUser } from "@/lib/auth";
import { errorResponse, notFoundResponse, ok } from "@/lib/api";
import { updateCompanyForUser } from "@/lib/company-service";
import { updateCompanySchema } from "@/lib/validations";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const company = await updateCompanyForUser(user.id, id, updateCompanySchema.parse(await request.json()));
    return company ? ok(company) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
