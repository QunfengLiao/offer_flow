import { requireUser } from "@/lib/auth";
import { errorResponse, notFoundResponse, ok } from "@/lib/api";
import { deleteCategoryForUser, renameCategoryForUser } from "@/lib/company-service";
import { companyCategorySchema } from "@/lib/validations";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const category = await renameCategoryForUser(user.id, id, companyCategorySchema.parse(await request.json()));
    return category ? ok(category) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const result = await deleteCategoryForUser(user.id, id);
    return result ? ok(result) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
