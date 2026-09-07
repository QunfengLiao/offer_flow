import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { registerSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api";
import { createDefaultCategoriesForUser } from "@/lib/company-service";

export async function POST(request: Request) {
  try {
    const input = registerSchema.parse(await request.json());
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({ data: { email: input.email, username: input.username, passwordHash } });
    await createDefaultCategoriesForUser(user.id);
    return NextResponse.json({ ok: true, data: { id: user.id, email: user.email, username: user.username } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
