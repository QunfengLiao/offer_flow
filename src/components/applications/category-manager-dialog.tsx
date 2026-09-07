"use client";

import { useEffect, useState } from "react";
import { App as AntdApp, Button, Input, Modal, Popconfirm, Select, Space, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import type { CompanyCategoryDto } from "@/lib/company-service";

const colors = ["blue", "cyan", "violet", "amber", "emerald", "slate"];

export function CategoryManagerDialog({ open, onOpenChange, categories, onCategoriesChange, createOnOpen = false }: { open: boolean; onOpenChange: (open: boolean) => void; categories: CompanyCategoryDto[]; onCategoriesChange: (categories: CompanyCategoryDto[]) => void; createOnOpen?: boolean }) {
  const { message } = AntdApp.useApp();
  const [editing, setEditing] = useState<CompanyCategoryDto | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");
  const [saving, setSaving] = useState(false);
  const startCreate = () => { setEditing(null); setName(""); setColor("blue"); setEditorOpen(true); };
  const startEdit = (category: CompanyCategoryDto) => { setEditing(category); setName(category.name); setColor(category.color); setEditorOpen(true); };
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/categories/${editing.id}` : "/api/categories", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, color }) });
      const body = await response.json();
      if (!response.ok) { message.error(body.error?.message || "保存分类失败"); return; }
      onCategoriesChange(editing ? categories.map((item) => item.id === editing.id ? body.data : item) : [...categories, body.data]);
      setEditing(null); setName(""); setEditorOpen(false);
      message.success(editing ? "分类已更新" : "分类已创建");
    } catch { message.error("保存分类失败，请检查网络后重试"); }
    finally { setSaving(false); }
  };
  const remove = async (category: CompanyCategoryDto) => {
    try {
      const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) { message.error(body.error?.message || "删除分类失败"); return; }
      onCategoriesChange(categories.filter((item) => item.id !== category.id));
      message.success("分类已删除，相关公司已变为未分类");
    } catch { message.error("删除分类失败，请检查网络后重试"); }
  };
  useEffect(() => {
    if (open && createOnOpen) startCreate();
  }, [open, createOnOpen]);
  return <Modal open={open} onCancel={() => onOpenChange(false)} footer={null} title="管理分类" width={480} destroyOnHidden>
    <Space orientation="vertical" size={10} style={{ width: "100%" }}>
      {categories.map((category) => <div className="category-manager-row" key={category.id}><Tag className={`company-category-badge company-category-${category.color}`}>{category.name}</Tag><Typography.Text type="secondary">{category.companyCount} 家公司</Typography.Text><Space size={2}><Button type="text" size="small" icon={<EditOutlined />} aria-label={`重命名 ${category.name}`} onClick={() => startEdit(category)} /><Popconfirm title={`删除“${category.name}”分类？`} description={`删除后，${category.companyCount} 家公司将变为未分类，投递记录不会被删除。`} okText="确认删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => remove(category)}><Button danger type="text" size="small" icon={<DeleteOutlined />} aria-label={`删除 ${category.name}`} /></Popconfirm></Space></div>)}
      {editorOpen ? <div className="category-editor"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={20} placeholder="分类名称" /><Select value={color} onChange={setColor} options={colors.map((value) => ({ value, label: value }))} /><Button type="primary" loading={saving} onClick={() => { void save(); }}>{editing ? "保存" : "创建"}</Button><Button onClick={() => { setEditing(null); setName(""); setEditorOpen(false); }}>取消</Button></div> : <Button type="dashed" icon={<PlusOutlined />} onClick={startCreate}>新建分类</Button>}
    </Space>
  </Modal>;
}
