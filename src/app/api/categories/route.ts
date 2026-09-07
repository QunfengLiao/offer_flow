import { requireUser } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { createCategoryForUser, listCategoriesForUser } from "@/lib/company-service";
import { companyCategorySchema } from "@/lib/validations";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await listCategoriesForUser(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    return ok(await createCategoryForUser(user.id, companyCategorySchema.parse(await request.json())), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
