import { requireUser } from "@/lib/auth";
import { errorResponse, notFoundResponse, ok } from "@/lib/api";
import { addApplicationNoteForUser } from "@/lib/application-service";
import { noteEventSchema } from "@/lib/validations";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { description } = noteEventSchema.parse(await request.json());
    const application = await addApplicationNoteForUser(user.id, id, description);
    return application ? ok(application, { status: 201 }) : notFoundResponse();
  } catch (error) {
    return errorResponse(error);
  }
}
