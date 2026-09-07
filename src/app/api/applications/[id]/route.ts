import { requireUser } from "@/lib/auth";
import { errorResponse, notFoundResponse, ok } from "@/lib/api";
import { deleteApplicationForUser, getApplicationForUser, updateApplicationForUser } from "@/lib/application-service";
import { updateApplicationSchema } from "@/lib/validations";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const application = await getApplicationForUser(user.id, id);
    return application ? ok(application) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = updateApplicationSchema.parse(await request.json());
    const application = await updateApplicationForUser(user.id, id, input);
    return application ? ok(application) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const deleted = await deleteApplicationForUser(user.id, id);
    return deleted ? ok({ deleted: true }) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
