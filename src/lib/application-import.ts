export const APPLICATION_IMPORT_COLUMNS = [
  { key: "companyName", label: "公司名称", required: true },
  { key: "companyCategory", label: "公司分类", required: false },
  { key: "applicationUrl", label: "投递链接", required: true },
  { key: "appliedAt", label: "投递日期", required: true },
  { key: "currentStatus", label: "当前状态", required: false },
  { key: "position1", label: "第一志愿", required: true },
  { key: "position2", label: "第二志愿", required: false },
  { key: "position3", label: "第三志愿", required: false },
  { key: "position4", label: "第四志愿", required: false },
  { key: "position5", label: "第五志愿", required: false },
  { key: "note", label: "备注", required: false },
] as const;

export type ApplicationImportField = (typeof APPLICATION_IMPORT_COLUMNS)[number]["key"];

export const APPLICATION_IMPORT_FIELD_LABELS: Record<ApplicationImportField, string> = Object.fromEntries(
  APPLICATION_IMPORT_COLUMNS.map((column) => [column.key, column.label]),
) as Record<ApplicationImportField, string>;
