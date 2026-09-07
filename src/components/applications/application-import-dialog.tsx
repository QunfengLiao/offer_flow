"use client";

import { useCallback, useState } from "react";
import { Alert, Button, Modal, Table, Typography } from "antd";
import type { TableProps } from "antd";
import { InboxOutlined, UploadOutlined } from "@ant-design/icons";
import { useDropzone } from "react-dropzone";
import type { FileRejection } from "react-dropzone";
import * as XLSX from "xlsx";
import { APPLICATION_IMPORT_COLUMNS, APPLICATION_IMPORT_FIELD_LABELS } from "@/lib/application-import";
import { applicationImportRowSchema } from "@/lib/validations";

type ImportRow = { rowNumber: number; values: Record<string, string> };
export type ApplicationImportError = { rowNumber: number; field: string; reason: string };
type ImportResult = { successCount: number; failureCount: number; errors: ApplicationImportError[] };

const importColumnLabels = new Map(APPLICATION_IMPORT_COLUMNS.map((column) => [column.key, column.label]));

function cellToText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value ?? "").trim();
}

function issueFromZod(rowNumber: number, path: PropertyKey[], reason: string): ApplicationImportError {
  const field = String(path[0] ?? "整行");
  return { rowNumber, field: APPLICATION_IMPORT_FIELD_LABELS[field as keyof typeof APPLICATION_IMPORT_FIELD_LABELS] ?? field, reason };
}

export function downloadApplicationTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([APPLICATION_IMPORT_COLUMNS.map((column) => column.label)]);
  worksheet["!cols"] = APPLICATION_IMPORT_COLUMNS.map((column) => ({ wch: column.key === "applicationUrl" ? 36 : column.key === "note" ? 32 : 16 }));
  worksheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(APPLICATION_IMPORT_COLUMNS.length - 1)}1` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "投递记录");
  XLSX.writeFile(workbook, "投递记录导入模板.xlsx");
}

export function ApplicationImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ApplicationImportError[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [serverError, setServerError] = useState("");

  const reset = useCallback(() => {
    setFile(null);
    setRows([]);
    setErrors([]);
    setResult(null);
    setReading(false);
    setImporting(false);
    setServerError("");
  }, []);

  const readWorkbook = useCallback(async (nextFile: File) => {
    setReading(true);
    setServerError("");
    setResult(null);
    try {
      const workbook = XLSX.read(await nextFile.arrayBuffer(), { type: "array", cellDates: true, raw: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("文件中没有可读取的工作表");
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false, raw: false });
      const headerRow = (matrix[0] ?? []).map(cellToText);
      const indexes = new Map(headerRow.map((header, index) => [header, index]));
      const missingColumns = APPLICATION_IMPORT_COLUMNS.filter((column) => column.required && !indexes.has(column.label));
      const headerErrors = missingColumns.map((column) => ({ rowNumber: 1, field: column.label, reason: `缺少必填列“${column.label}”` }));
      const importedRows = missingColumns.length > 0 ? [] : matrix.slice(1).flatMap((cells, index) => {
        const values = Object.fromEntries(APPLICATION_IMPORT_COLUMNS.map((column) => [column.key, cellToText(cells[indexes.get(column.label) ?? -1])]));
        return Object.values(values).some(Boolean) ? [{ rowNumber: index + 2, values }] : [];
      });
      const validationErrors = importedRows.flatMap(({ rowNumber, values }) => {
        const parsed = applicationImportRowSchema.safeParse(values);
        return parsed.success ? [] : parsed.error.issues.map((issue) => issueFromZod(rowNumber, issue.path, issue.message));
      });
      setFile(nextFile);
      setRows(importedRows);
      setErrors([...headerErrors, ...validationErrors]);
    } catch (error) {
      setFile(nextFile);
      setRows([]);
      setErrors([{ rowNumber: 0, field: "文件", reason: error instanceof Error ? error.message : "文件读取失败" }]);
    } finally {
      setReading(false);
    }
  }, []);

  const handleDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    if (rejectedFiles.length > 0 || !acceptedFiles[0]) {
      setFile(null);
      setRows([]);
      setErrors([{ rowNumber: 0, field: "文件", reason: "只支持 .xlsx 或 .xls 文件" }]);
      return;
    }
    void readWorkbook(acceptedFiles[0]);
  }, [readWorkbook]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
  });

  const importRows = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setServerError("");
    try {
      const response = await fetch("/api/applications/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await response.json();
      if (!response.ok) {
        setServerError(body.error?.message || "导入失败，请重试");
        return;
      }
      const nextResult = body.data as ImportResult;
      setResult(nextResult);
      setErrors(nextResult.errors);
      if (nextResult.successCount > 0) onImported();
    } catch {
      setServerError("导入失败，请检查网络后重试");
    } finally {
      setImporting(false);
    }
  };

  const issueColumns: TableProps<ApplicationImportError>["columns"] = [
    { title: "行号", dataIndex: "rowNumber", width: 70, render: (value: number) => value > 0 ? value : "—" },
    { title: "字段", dataIndex: "field", width: 120 },
    { title: "错误原因", dataIndex: "reason" },
  ];

  const close = () => {
    if (reading || importing) return;
    reset();
    onOpenChange(false);
  };

  return <Modal
    className="application-import-modal"
    open={open}
    title={<div className="application-import-heading"><Typography.Title level={3}>导入投递记录</Typography.Title><Typography.Text type="secondary">上传模板文件，系统会逐行校验并导入有效记录。</Typography.Text></div>}
    onCancel={close}
    destroyOnHidden
    width={760}
    footer={<div className="application-import-footer"><Button onClick={close} disabled={reading || importing}>取消</Button><Button type="primary" icon={<UploadOutlined />} loading={importing} disabled={reading || rows.length === 0} onClick={() => { void importRows(); }}>导入记录</Button></div>}
  >
    <div className="application-import-scroll">
      <div {...getRootProps({ className: `application-import-dropzone${isDragActive ? " is-drag-active" : ""}` })}>
        <input {...getInputProps()} />
        <InboxOutlined className="application-import-dropzone-icon" />
        <Typography.Text strong>{isDragActive ? "松开鼠标上传文件" : "拖拽 Excel 文件到这里，或点击选择文件"}</Typography.Text>
        <Typography.Text type="secondary">支持 .xlsx / .xls，模板列中不需要填写 userId</Typography.Text>
      </div>

      {file && <div className="application-import-file"><span>{file.name}</span><Typography.Text type="secondary">{reading ? "正在读取…" : `${rows.length} 条数据`}</Typography.Text></div>}
      {serverError && <Alert showIcon type="error" message={serverError} />}
      {result && <Alert showIcon type={result.failureCount > 0 ? "warning" : "success"} message={`成功 ${result.successCount} 条，失败 ${result.failureCount} 条`} description={result.failureCount > 0 ? "失败行未写入数据库，请根据下方错误信息修正后重新导入。" : "投递记录列表已自动刷新。"} />}
      {!result && rows.length > 0 && <Alert showIcon type={errors.length > 0 ? "warning" : "success"} message={`已读取 ${rows.length} 条，${errors.length > 0 ? `发现 ${new Set(errors.map((error) => error.rowNumber)).size} 行错误` : "校验通过"}`} />}
      {errors.length > 0 && <div className="application-import-errors"><Typography.Text strong>校验错误</Typography.Text><Table<ApplicationImportError> size="small" rowKey={(error) => `${error.rowNumber}-${error.field}-${error.reason}`} columns={issueColumns} dataSource={errors} pagination={{ pageSize: 5, showSizeChanger: false }} /></div>}
      <Typography.Paragraph className="application-import-hint">必填列：{APPLICATION_IMPORT_COLUMNS.filter((column) => column.required).map((column) => importColumnLabels.get(column.key)).join("、")}。当前状态可填写状态名称或中文标签，留空默认为“已投递”；公司分类需先在系统中创建。</Typography.Paragraph>
    </div>
  </Modal>;
}
