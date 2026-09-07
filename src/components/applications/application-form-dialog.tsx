"use client";

import { useEffect, useRef, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import type { ApplicationStatus } from "@prisma/client";
import { App as AntdApp, Alert, Button, Col, DatePicker, Divider, Form, Input, Modal, Row, Select, Space, Typography } from "antd";
import type { FormProps } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { MAX_APPLICATION_POSITIONS, STATUS_GROUPS } from "@/lib/constants";
import { buildPositionInput } from "@/lib/application-form";
import { applicationSchema } from "@/lib/validations";
import type { ApplicationDto } from "@/lib/application-service";
import type { CompanyCategoryDto } from "@/lib/company-service";

type FormValues = {
  companyName: string;
  companyCategoryId: string | null;
  isCompanyFavorite: boolean;
  applicationUrl: string;
  appliedAt: Dayjs;
  positions: { title: string }[];
  currentStatus: ApplicationStatus;
  note: string;
};

function formValues(): FormValues {
  return {
    companyName: "",
    companyCategoryId: null,
    isCompanyFavorite: false,
    applicationUrl: "https://",
    appliedAt: dayjs(),
    positions: Array.from({ length: MAX_APPLICATION_POSITIONS }, () => ({ title: "" })),
    currentStatus: "APPLIED",
    note: "",
  };
}

const categoryColors = ["blue", "cyan", "violet", "amber", "emerald", "slate"] as const;

export function ApplicationFormDialog({ open, onOpenChange, onSaved, categories, onCategoriesChange }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: (application: ApplicationDto) => void; categories: CompanyCategoryDto[]; onCategoriesChange: (categories: CompanyCategoryDto[]) => void }) {
  const [form] = Form.useForm<FormValues>();
  const [serverError, setServerError] = useState("");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<(typeof categoryColors)[number]>("blue");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const companyLookupRequest = useRef(0);
  const categoryManuallySelected = useRef(false);
  const { message } = AntdApp.useApp();

  useEffect(() => {
    if (open) {
      companyLookupRequest.current += 1;
      categoryManuallySelected.current = false;
      form.setFieldsValue(formValues());
      setServerError("");
    }
  }, [form, open]);

  const onSubmit = async (values: FormValues) => {
    setServerError("");
    const basePayload = {
      companyName: values.companyName.trim(),
      companyCategoryId: values.companyCategoryId || null,
      isCompanyFavorite: form.getFieldValue("isCompanyFavorite") ?? false,
      applicationUrl: values.applicationUrl.trim(),
      appliedAt: values.appliedAt.format("YYYY-MM-DD"),
      positions: buildPositionInput(values.positions),
      note: values.note?.trim() || undefined,
    };
    const parsed = applicationSchema.safeParse(basePayload);
    if (!parsed.success) {
      form.setFields(parsed.error.issues.map((issue) => ({ name: issue.path as never, errors: [issue.message] })));
      message.warning(parsed.error.issues[0]?.message || "请检查表单内容");
      if (parsed.error.issues[0]) void form.scrollToField(parsed.error.issues[0].path as never, { block: "center" });
      return;
    }

    try {
      const response = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(basePayload) });
      const body = await response.json();
      if (!response.ok) { setServerError(body.error?.message || "保存失败，请重试"); return; }
      message.success("投递已添加");
      onSaved(body.data);
      onOpenChange(false);
    } catch {
      setServerError("保存失败，请检查网络后重试");
    }
  };

  const lookupCompany = async () => {
    const companyName = form.getFieldValue("companyName")?.trim();
    if (!companyName) return;
    const requestId = ++companyLookupRequest.current;
    try {
      const response = await fetch(`/api/companies?name=${encodeURIComponent(companyName)}`);
      const body = await response.json();
      if (requestId !== companyLookupRequest.current || form.getFieldValue("companyName")?.trim() !== companyName || categoryManuallySelected.current) return;
      if (response.ok && body.data) {
        form.setFieldsValue({ companyCategoryId: body.data.categoryId, isCompanyFavorite: body.data.isFavorite });
      } else if (response.ok) {
        form.setFieldsValue({ companyCategoryId: null, isCompanyFavorite: false });
      }
    } catch { /* metadata lookup is optional; save remains available */ }
  };

  const createCategory = async () => {
    setCreatingCategory(true);
    try {
      const response = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCategoryName, color: newCategoryColor }) });
      const body = await response.json();
      if (!response.ok) { message.error(body.error?.message || "创建分类失败"); return; }
      onCategoriesChange([...categories, body.data]);
      categoryManuallySelected.current = true;
      form.setFieldValue("companyCategoryId", body.data.id);
      setNewCategoryName("");
      setNewCategoryOpen(false);
      message.success("分类已创建并选中");
    } catch { message.error("创建分类失败，请检查网络后重试"); }
    finally { setCreatingCategory(false); }
  };

  const onFinishFailed: FormProps<FormValues>["onFinishFailed"] = ({ errorFields }) => {
    const firstError = errorFields[0];
    message.warning(firstError?.errors[0] || "请检查表单内容");
    if (firstError) void form.scrollToField(firstError.name, { block: "center" });
  };

  return <Modal
    className="application-form-modal"
    open={open}
     title={<div className="application-form-heading"><Typography.Title level={3}>添加投递</Typography.Title><Typography.Text type="secondary">建立一份清晰的投递档案，后续进展可以随时补充。</Typography.Text></div>}
    onCancel={() => onOpenChange(false)}
    keyboard
    centered
     footer={<div className="application-form-footer"><Button onClick={() => onOpenChange(false)}>取消</Button><Button type="primary" htmlType="submit" form="application-form" icon={<PlusOutlined />}>保存投递</Button></div>}
    destroyOnHidden
    width={820}
  >
    <div className="application-form-scroll">
    <Form<FormValues> id="application-form" className="application-form" form={form} layout="vertical" requiredMark={false} onFinish={onSubmit} onFinishFailed={onFinishFailed}>
      <div className="application-form-section">
        <div className="application-form-section-heading"><Typography.Text>基本信息</Typography.Text><Typography.Text type="secondary">分类适用于该公司的全部投递</Typography.Text></div>
        <Row gutter={16}>
          <Col span={24}><Form.Item label="公司名称" name="companyName" rules={[{ required: true, message: "公司名称不能为空" }, { max: 100, message: "公司名称不能超过 100 个字符" }]}><Input placeholder="例如：星河科技" onChange={() => { companyLookupRequest.current += 1; categoryManuallySelected.current = false; form.setFieldsValue({ companyCategoryId: null, isCompanyFavorite: false }); }} onBlur={() => { void lookupCompany(); }} /></Form.Item></Col>
          <Col span={24}><Form.Item label="公司分类" name="companyCategoryId"><Select allowClear placeholder="未分类" onChange={() => { categoryManuallySelected.current = true; }} options={categories.map((category) => ({ value: category.id, label: category.name }))} dropdownRender={(menu) => <>{menu}<Divider style={{ margin: "6px 0" }} /><Button type="text" block icon={<PlusOutlined />} onMouseDown={(event) => event.preventDefault()} onClick={() => setNewCategoryOpen(true)}>新建分类</Button></>} /></Form.Item></Col>
          <Col span={24}><Form.Item label="投递链接" name="applicationUrl" rules={[{ required: true, message: "投递链接不能为空" }, { type: "url", message: "请输入合法的投递链接" }]}><Input placeholder="https://..." /></Form.Item></Col>
        </Row>
      </div>

      <div className="application-form-section">
        <div className="application-form-section-heading"><Typography.Text>投递信息</Typography.Text><Typography.Text type="secondary">记录这次投递的时间和当前阶段</Typography.Text></div>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item label="投递日期" name="appliedAt" rules={[{ required: true, message: "投递日期不能为空" }]}><DatePicker style={{ width: "100%" }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item label="当前状态" name="currentStatus"><Select options={STATUS_GROUPS.map((group) => ({ label: group.label, options: group.options.map(([value, label]) => ({ value, label })) }))} /></Form.Item></Col>
        </Row>
      </div>

      <div className="application-form-section application-form-positions-section">
        <div className="application-form-section-heading"><Typography.Text>志愿职位</Typography.Text><Typography.Text type="secondary">最多填写五个志愿，第一志愿为必填</Typography.Text></div>
        <Space orientation="vertical" size={8} className="application-position-list">
          {Array.from({ length: MAX_APPLICATION_POSITIONS }, (_, index) => index + 1).map((priority, index) => <Space.Compact key={priority} className="application-position-input">
            <span className="application-position-number">{priority}</span>
            <Form.Item name={["positions", index, "title"]} style={{ flex: 1, marginBottom: 0 }} rules={index === 0 ? [{ required: true, message: "第一志愿不能为空" }] : undefined}>
              <Input placeholder={`${priority === 1 ? "第一" : priority === 2 ? "第二" : priority === 3 ? "第三" : priority === 4 ? "第四" : "第五"}志愿职位`} />
            </Form.Item>
          </Space.Compact>)}
        </Space>
      </div>

      <div className="application-form-section application-form-note-section">
        <div className="application-form-section-heading"><Typography.Text>备注</Typography.Text><Typography.Text type="secondary">可选，记录薪资、截止时间或准备事项</Typography.Text></div>
        <Form.Item name="note"><Input.TextArea rows={4} showCount maxLength={2000} placeholder="写下这份投递需要记住的事情……" /></Form.Item>
      </div>
      {serverError && <Alert showIcon type="error" message={serverError} />}
    </Form>
    </div>
    <Modal open={newCategoryOpen} title="新建分类" width={420} okText="创建并选中" cancelText="取消" confirmLoading={creatingCategory} onCancel={() => setNewCategoryOpen(false)} onOk={() => { void createCategory(); }} destroyOnHidden>
      <Space orientation="vertical" size={12} style={{ width: "100%" }}><Input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} maxLength={20} placeholder="分类名称（1～20 个字符）" /><Select value={newCategoryColor} onChange={setNewCategoryColor} options={categoryColors.map((color) => ({ value: color, label: color }))} /></Space>
    </Modal>
  </Modal>;
}
