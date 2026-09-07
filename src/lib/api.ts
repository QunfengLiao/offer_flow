import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_ERROR", message: "请检查表单内容", fields: error.flatten().fieldErrors } }, { status: 400 });
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHENTICATED", message: "请先登录" } }, { status: 401 });
  }
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return NextResponse.json({ ok: false, error: { code: "CONFLICT", message: "名称已存在，请换一个" } }, { status: 409 });
  }
  if (error instanceof Error && error.message === "INVALID_CATEGORY") {
    return NextResponse.json({ ok: false, error: { code: "INVALID_CATEGORY", message: "分类不存在或不属于当前用户" } }, { status: 400 });
  }
  if (error instanceof Error && error.message === "INVALID_IMPORT_PAYLOAD") {
    return NextResponse.json({ ok: false, error: { code: "INVALID_IMPORT_PAYLOAD", message: "导入数据格式不正确" } }, { status: 400 });
  }
  if (error instanceof Error && error.message === "IMPORT_COMPANY_RESOLUTION_FAILED") {
    return NextResponse.json({ ok: false, error: { code: "IMPORT_COMPANY_RESOLUTION_FAILED", message: "公司信息处理失败，请检查后重试" } }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "操作失败，请稍后重试" } }, { status: 500 });
}

export function notFoundResponse() {
  return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "资源不存在" } }, { status: 404 });
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}
