"use client";

import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { differenceInCalendarDays } from "date-fns";
import type { ApplicationStatus } from "@prisma/client";
import { App as AntdApp, Button, DatePicker, Drawer, Dropdown, Flex, Input, Popover, Select, Space, Timeline, Tooltip, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, CalendarOutlined, CheckOutlined, CloseOutlined, CopyOutlined, DeleteOutlined, EditOutlined, LinkOutlined, MessageOutlined, MoreOutlined, PlusOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { StatusBadge } from "./status-badge";
import { isTerminalStatus, MAX_APPLICATION_POSITIONS, STATUS_GROUPS, statusVisualConfig } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { ApplicationDto } from "@/lib/application-service";
import type { CompanyCategoryDto } from "@/lib/company-service";

type ApplicationUpdate = {
  companyName?: string;
  applicationUrl?: string;
  appliedAt?: string;
  positions?: { priority: number; title: string }[];
  note?: string | null;
  currentStatus?: ApplicationStatus;
};

type PositionRow = { id: string; priority: number; title: string };
type BusyField = "status" | "note" | "application" | "positions" | null;

const PROGRESS_STAGE_STATUSES: ApplicationStatus[] = [
  "APPLIED",
  "ASSESSMENT",
  "WRITTEN_TEST",
  "FIRST_INTERVIEW",
  "SECOND_INTERVIEW",
  "THIRD_INTERVIEW",
  "HR_INTERVIEW",
  "OFFER",
];

const POSITION_MARKS = ["①", "②", "③", "④", "⑤"];

function eventTitle(event: ApplicationDto["events"][number]) {
  if (event.type === "NOTE") return "普通动态";
  if (!event.fromStatus && event.toStatus === "APPLIED") return "创建投递";
  return "状态变更";
}

function StatusOption({ status, label }: { status: ApplicationStatus; label: string }) {
  const visual = statusVisualConfig[status];
  return <span className="status-option"><span className="status-option-dot" style={{ backgroundColor: visual.dotColor }} />{label}</span>;
}

function getRejectionInfo(application: ApplicationDto) {
  if (application.currentStatus !== "REJECTED") return null;
  const events = [...application.events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const rejectionIndex = events.findIndex((event) => event.type === "STATUS_CHANGE" && event.toStatus === "REJECTED");
  const rejectionEvent = rejectionIndex >= 0 ? events[rejectionIndex] : null;
  const previousEvent = rejectionIndex >= 0 ? [...events.slice(0, rejectionIndex)].reverse().find((event) => event.type === "STATUS_CHANGE" && event.toStatus && event.toStatus !== "REJECTED") : null;
  const rejectedAt = rejectionEvent?.occurredAt ?? application.updatedAt;
  return {
    stage: previousEvent?.toStatusLabel ?? "已投递",
    stageStatus: previousEvent?.toStatus ?? "APPLIED",
    durationDays: Math.max(0, differenceInCalendarDays(new Date(rejectedAt), new Date(application.appliedAt))),
  };
}

function getCurrentStatusDurationDays(application: ApplicationDto) {
  const statusEvent = application.events
    .filter((event) => event.type === "STATUS_CHANGE" && event.toStatus === application.currentStatus)
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0];
  return Math.max(0, differenceInCalendarDays(new Date(), new Date(statusEvent?.occurredAt ?? application.appliedAt)));
}

function HistoryTimeline({ events, compact = false }: { events: ApplicationDto["events"]; compact?: boolean }) {
  return <Timeline className={compact ? "status-history-mini" : "application-history"} items={events.map((event) => ({
    color: event.type === "STATUS_CHANGE" && event.toStatus ? statusVisualConfig[event.toStatus].dotColor : "#9CA3AF",
    content: <div className="timeline-event">
      <div className="timeline-event-heading">
        {event.type === "STATUS_CHANGE" && event.toStatus ? <StatusBadge status={event.toStatus} /> : <Typography.Text strong>{eventTitle(event)}</Typography.Text>}
        {event.type === "STATUS_CHANGE" && event.fromStatusLabel && <Typography.Text type="secondary" className="timeline-transition">由 {event.fromStatusLabel} 更新</Typography.Text>}
      </div>
      {event.description && <Typography.Paragraph className="timeline-event-description">{event.description}</Typography.Paragraph>}
      <Typography.Text type="secondary" className="timeline-event-time">{formatDateTime(event.occurredAt)}</Typography.Text>
    </div>,
  }))} />;
}

function StageRail({ currentStatus, rejectionStage, stageTimes }: { currentStatus: ApplicationStatus; rejectionStage?: ApplicationStatus; stageTimes?: Partial<Record<ApplicationStatus, string>> }) {
  const reachedStatus = currentStatus === "REJECTED" ? rejectionStage ?? "APPLIED" : currentStatus;
  const currentIndex = PROGRESS_STAGE_STATUSES.indexOf(reachedStatus);
  const isRejected = currentStatus === "REJECTED";
  const isClosed = currentStatus === "CLOSED";

  return <div className={`application-stage-rail${isRejected || isClosed ? " is-terminated" : ""}`} aria-label="投递阶段进度">
    {PROGRESS_STAGE_STATUSES.map((stage, index) => {
      const isCurrent = !isRejected && !isClosed && stage === currentStatus;
      const isCompleted = index < currentIndex || (currentStatus === "OFFER" && stage === "OFFER");
      const visual = statusVisualConfig[stage];
      return <div className={`application-stage${isCurrent ? " is-current" : ""}${isCompleted ? " is-completed" : ""}`} key={stage}>
        <div className="application-stage-node-row">
          {stageTimes?.[stage] ? <Tooltip title={`${visual.label} · ${formatDateTime(stageTimes[stage]!)}`}><span className="application-stage-node" style={isCurrent ? { color: "#fff", backgroundColor: visual.dotColor, borderColor: visual.dotColor } : undefined}>{isCompleted ? <CheckOutlined /> : <span />}</span></Tooltip> : <span className="application-stage-node" style={isCurrent ? { color: "#fff", backgroundColor: visual.dotColor, borderColor: visual.dotColor } : undefined}>{isCompleted ? <CheckOutlined /> : <span />}</span>}
          {index < PROGRESS_STAGE_STATUSES.length - 1 && <span className={`application-stage-connector${index < currentIndex ? " is-completed" : ""}`} />}
        </div>
        <span className="application-stage-label">{statusVisualConfig[stage].label}</span>
      </div>;
    })}
    {(isRejected || isClosed) && <div className="application-stage-termination">
      <span className="application-stage-node">{isRejected ? "×" : "—"}</span>
      <span className="application-stage-label">{isRejected ? "已拒绝" : "流程结束"}</span>
    </div>}
  </div>;
}

function positionLabel(priority: number) {
  if (priority === 1) return "第一志愿";
  if (priority === 2) return "第二志愿";
  if (priority === 3) return "第三志愿";
  return `第${priority}志愿`;
}

function positionRowsFromApplication(application: ApplicationDto): PositionRow[] {
  return application.positions.map((position) => ({ id: position.id, priority: position.priority, title: position.title }));
}

function normalizePositionRows(rows: PositionRow[]) {
  return rows.map((position, index) => ({ priority: index + 1, title: position.title.trim() }));
}

export function ApplicationDrawer({ application, open, onOpenChange, onDelete, onChanged, categories, onCategoriesChange, onCompanyChanged }: {
  application: ApplicationDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onChanged: (application: ApplicationDto) => void;
  categories: CompanyCategoryDto[];
  onCategoriesChange: (categories: CompanyCategoryDto[]) => void;
  onCompanyChanged: (application: ApplicationDto, patch: { categoryId?: string | null; isFavorite?: boolean }, category?: CompanyCategoryDto | null) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<ApplicationStatus>("APPLIED");
  const [statusDescription, setStatusDescription] = useState("");
  const [statusEditorOpen, setStatusEditorOpen] = useState(false);
  const [activityNote, setActivityNote] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const [busy, setBusy] = useState<BusyField>(null);
  const busyRef = useRef<BusyField>(null);
  const [companyBusy, setCompanyBusy] = useState(false);
  const companyBusyRef = useRef(false);
  const [editingCompanyName, setEditingCompanyName] = useState(false);
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [editingLink, setEditingLink] = useState(false);
  const [editingAppliedAt, setEditingAppliedAt] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [positionRows, setPositionRows] = useState<PositionRow[]>([]);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [positionDraft, setPositionDraft] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<CompanyCategoryDto["color"]>("blue");
  const { message } = AntdApp.useApp();

  useEffect(() => {
    if (!application) return;
    setStatus(application.currentStatus);
    setStatusDescription("");
    setStatusEditorOpen(false);
    setActivityNote("");
    setActivityOpen(false);
    setCompanyNameDraft(application.companyName);
    setLinkDraft(application.applicationUrl);
    setNoteDraft(application.note ?? "");
    setPositionRows(positionRowsFromApplication(application));
    setEditingCompanyName(false);
    setEditingLink(false);
    setEditingAppliedAt(false);
    setCategoryOpen(false);
    setNewCategoryOpen(false);
    setNewCategoryName("");
    setEditingNote(false);
    setEditingPositionId(null);
  }, [application]);

  if (!application) return null;

  const rejectionInfo = getRejectionInfo(application);
  const timelineEvents = [...application.events].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const statusEvents = timelineEvents.filter((event) => event.type === "STATUS_CHANGE" && event.toStatus);
  const displayTimelineEvents = statusEvents.length > 0 ? statusEvents : [{
    id: `applied-${application.id}`,
    type: "STATUS_CHANGE" as const,
    typeLabel: "状态变更",
    fromStatus: null,
    fromStatusLabel: null,
    toStatus: "APPLIED" as ApplicationStatus,
    toStatusLabel: statusVisualConfig.APPLIED.label,
    description: null,
    occurredAt: application.appliedAt,
  }];
  const daysSinceLastActivity = Math.max(0, differenceInCalendarDays(new Date(), new Date(application.lastActivityAt)));
  const currentStatusDurationDays = getCurrentStatusDurationDays(application);
  const needsAttention = !isTerminalStatus(application.currentStatus) && daysSinceLastActivity >= 7;
  const lastActivityLabel = daysSinceLastActivity === 0 ? "今天" : `${daysSinceLastActivity} 天前`;
  const progressSummary = rejectionInfo ? `流程已结束 · 共 ${rejectionInfo.durationDays} 天` : application.currentStatus === "CLOSED" ? "流程已结束" : `已在「${statusVisualConfig[application.currentStatus].label}」停留 ${currentStatusDurationDays} 天`;
  const stageTimes = displayTimelineEvents.reduce<Partial<Record<ApplicationStatus, string>>>((times, event) => {
    if (event.toStatus && !times[event.toStatus]) times[event.toStatus] = event.occurredAt;
    return times;
  }, {});

  const saveApplicationField = async (field: Exclude<BusyField, null>, update: ApplicationUpdate, eventDescription?: string) => {
    if (busyRef.current !== null) return null;
    busyRef.current = field;
    setBusy(field);
    try {
      const payload = {
        companyName: (update.companyName ?? application.companyName).trim(),
        applicationUrl: update.applicationUrl ?? application.applicationUrl,
        appliedAt: (update.appliedAt ?? application.appliedAt).slice(0, 10),
        positions: update.positions ?? application.positions.map(({ priority, title }) => ({ priority, title })),
        note: update.note !== undefined ? update.note : application.note,
        currentStatus: update.currentStatus ?? application.currentStatus,
        ...(eventDescription ? { eventDescription } : {}),
      };
      const response = await fetch(`/api/applications/${application.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) {
        message.error(body.error?.message || "保存失败");
        return null;
      }
      onChanged(body.data);
      message.success("已保存");
      return body.data as ApplicationDto;
    } catch {
      message.error("保存失败，请检查网络后重试");
      return null;
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  };

  const updateStatus = async () => {
    if (status === application.currentStatus) return;
    const previousStatus = application.currentStatus;
    const next = await saveApplicationField("status", { currentStatus: status }, statusDescription.trim() || undefined);
    if (!next) setStatus(previousStatus);
    else setStatus(next.currentStatus);
    if (next) {
      setStatusDescription("");
      setStatusEditorOpen(false);
    }
  };

  const addActivityNote = async () => {
    if (!activityNote.trim() || busyRef.current !== null) return;
    busyRef.current = "note";
    setBusy("note");
    try {
      const response = await fetch(`/api/applications/${application.id}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: activityNote.trim() }) });
      const body = await response.json();
      if (!response.ok) { message.error(body.error?.message || "动态记录失败"); return; }
      onChanged(body.data);
      message.success("已保存");
      setActivityNote("");
      setActivityOpen(false);
    } catch {
      message.error("动态记录失败，请检查网络后重试");
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  };

  const changeCompany = async (patch: { categoryId?: string | null; isFavorite?: boolean }, category?: CompanyCategoryDto | null) => {
    if (companyBusyRef.current) return false;
    companyBusyRef.current = true;
    setCompanyBusy(true);
    const saved = await onCompanyChanged(application, patch, category);
    if (saved) message.success("已保存");
    companyBusyRef.current = false;
    setCompanyBusy(false);
    return saved;
  };

  const commitCompanyName = async () => {
    const value = companyNameDraft.trim();
    if (!value) {
      message.warning("公司名称不能为空");
      setCompanyNameDraft(application.companyName);
      setEditingCompanyName(false);
      return;
    }
    if (value === application.companyName) {
      setEditingCompanyName(false);
      return;
    }
    const next = await saveApplicationField("application", { companyName: value });
    setCompanyNameDraft(next?.companyName ?? application.companyName);
    setEditingCompanyName(false);
  };

  const commitLink = async () => {
    const value = linkDraft.trim();
    try {
      new URL(value);
    } catch {
      message.error("请输入合法的投递链接");
      setLinkDraft(application.applicationUrl);
      setEditingLink(false);
      return;
    }
    if (value === application.applicationUrl) {
      setEditingLink(false);
      return;
    }
    const next = await saveApplicationField("application", { applicationUrl: value });
    setLinkDraft(next?.applicationUrl ?? application.applicationUrl);
    setEditingLink(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(application.applicationUrl);
      message.success("链接已复制");
    } catch {
      message.error("复制失败，请手动复制链接");
    }
  };

  const saveNote = async () => {
    const next = await saveApplicationField("application", { note: noteDraft.trim() || null });
    setNoteDraft(next?.note ?? application.note ?? "");
    setEditingNote(false);
  };

  const persistPositions = async (nextRows: PositionRow[], previousRows: PositionRow[]) => {
    const next = await saveApplicationField("positions", { positions: normalizePositionRows(nextRows) });
    if (next) {
      setPositionRows(positionRowsFromApplication(next));
      setEditingPositionId(null);
      setPositionDraft("");
    } else {
      setPositionRows(previousRows);
      setEditingPositionId(null);
      setPositionDraft("");
    }
  };

  const commitPositionTitle = async (id: string) => {
    const row = positionRows.find((item) => item.id === id);
    if (!row) return;
    const value = positionDraft.trim();
    if (!value) {
      if (id.startsWith("draft-")) {
        setPositionRows((current) => current.filter((item) => item.id !== id));
        setEditingPositionId(null);
        setPositionDraft("");
      } else {
        message.warning("职位名称不能为空");
        setPositionDraft(row.title);
      }
      return;
    }
    if (value === row.title) {
      setEditingPositionId(null);
      return;
    }
    await persistPositions(positionRows.map((item) => item.id === id ? { ...item, title: value } : item), positionRows);
  };

  const addPosition = () => {
    if (busy !== null || positionRows.length >= MAX_APPLICATION_POSITIONS) return;
    const id = `draft-${Date.now()}`;
    setPositionRows((current) => [...current, { id, priority: current.length + 1, title: "" }]);
    setEditingPositionId(id);
    setPositionDraft("");
  };

  const removePosition = async (row: PositionRow) => {
    if (positionRows.length <= 1 || busy !== null) {
      if (positionRows.length <= 1) message.warning("至少保留第一志愿");
      return;
    }
    const previousRows = positionRows;
    const nextRows = positionRows.filter((item) => item.id !== row.id);
    if (row.id.startsWith("draft-")) {
      setPositionRows(nextRows);
      setEditingPositionId(null);
      return;
    }
    await persistPositions(nextRows, previousRows);
  };

  const movePosition = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (busy !== null || nextIndex < 0 || nextIndex >= positionRows.length || editingPositionId) return;
    const previousRows = positionRows;
    const nextRows = [...positionRows];
    [nextRows[index], nextRows[nextIndex]] = [nextRows[nextIndex], nextRows[index]];
    await persistPositions(nextRows, previousRows);
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      message.warning("分类名称不能为空");
      return;
    }
    if (companyBusyRef.current) return;
    companyBusyRef.current = true;
    setCompanyBusy(true);
    try {
      const response = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, color: newCategoryColor }) });
      const body = await response.json();
      if (!response.ok) { message.error(body.error?.message || "创建分类失败"); return; }
      const category = body.data as CompanyCategoryDto;
      onCategoriesChange([...categories, category]);
      const saved = await onCompanyChanged(application, { categoryId: category.id }, category);
      if (saved) message.success("已保存");
      setNewCategoryName("");
      setNewCategoryOpen(false);
      setCategoryOpen(false);
    } catch {
      message.error("创建分类失败，请检查网络后重试");
    } finally {
      companyBusyRef.current = false;
      setCompanyBusy(false);
    }
  };

  const categoryOptions = [
    { key: "UNCATEGORIZED", label: "未分类" },
    ...categories.map((category) => ({ key: category.id, label: category.name })),
  ];

  const newCategoryContent = <div className="drawer-new-category">
    <Typography.Text strong>新建分类</Typography.Text>
    <Input size="small" autoFocus value={newCategoryName} maxLength={20} placeholder="新分类名称" onChange={(event) => setNewCategoryName(event.target.value)} onPressEnter={() => { void createCategory(); }} />
    <Select size="small" value={newCategoryColor} onChange={setNewCategoryColor} options={["blue", "cyan", "violet", "amber", "emerald", "slate"].map((color) => ({ value: color, label: color }))} />
    <Flex gap={4} justify="end"><Button size="small" type="primary" icon={<CheckOutlined />} loading={companyBusy} onClick={() => { void createCategory(); }}>创建</Button><Button size="small" onClick={() => { setNewCategoryOpen(false); }}>取消</Button></Flex>
  </div>;

  const categoryDropdownContent = <div className="category-dropdown-panel">
    <div className="category-option-list">
      {categoryOptions.map((option) => {
        const selected = (application.companyCategory?.id ?? "UNCATEGORIZED") === option.key;
        return <button type="button" className={`category-option${selected ? " is-selected" : ""}`} key={option.key} onClick={() => { setCategoryOpen(false); void changeCompany({ categoryId: option.key === "UNCATEGORIZED" ? null : option.key }); }}>
          <span>{option.label}</span>{selected && <CheckOutlined />}
        </button>;
      })}
    </div>
    {newCategoryOpen ? newCategoryContent : <button type="button" className="category-create-trigger" onClick={() => setNewCategoryOpen(true)}><PlusOutlined /> 新建分类</button>}
  </div>;

  const statusEditorContent = <div className="status-editor-popover">
    <Typography.Text strong>更新当前阶段</Typography.Text>
    <Select aria-label="选择新的状态" value={status} onChange={(value) => setStatus(value as ApplicationStatus)} options={STATUS_GROUPS.map((group) => ({ label: group.label, options: group.options.map(([value, label]) => ({ value, label: <StatusOption status={value} label={label} /> })) }))} />
    {status !== application.currentStatus && <Input.TextArea autoFocus value={statusDescription} onChange={(event) => setStatusDescription(event.target.value)} placeholder="补充说明（可选）" maxLength={500} autoSize={{ minRows: 2, maxRows: 4 }} />}
    <Flex justify="end" gap={8}><Button size="small" onClick={() => { setStatus(application.currentStatus); setStatusDescription(""); setStatusEditorOpen(false); }}>取消</Button><Button type="primary" size="small" loading={busy === "status"} disabled={busy !== null || status === application.currentStatus} onClick={() => { void updateStatus(); }}>保存状态</Button></Flex>
  </div>;

  return <Drawer
    className="application-drawer"
    open={open}
    keyboard
    onClose={() => onOpenChange(false)}
    title={<div className="application-drawer-heading"><Typography.Text strong>投递详情</Typography.Text><Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: [{ key: "delete", danger: true, icon: <DeleteOutlined />, label: "删除投递" }], onClick: ({ key }) => { if (key === "delete") onDelete(); } }}><Button type="text" size="small" icon={<MoreOutlined />} aria-label="更多投递操作" /></Dropdown></div>}
    size={700}
  >
    <section className="drawer-summary" aria-labelledby="application-company-name">
      <div className="drawer-company-heading">
        <div className="drawer-company-title">
          <Tooltip title={application.isCompanyFavorite ? "取消收藏公司" : "收藏公司"}><Button type="text" className={`company-favorite-button${application.isCompanyFavorite ? " is-favorite" : ""}`} icon={application.isCompanyFavorite ? <StarFilled /> : <StarOutlined />} aria-label={`${application.isCompanyFavorite ? "取消收藏" : "收藏"}${application.companyName}`} loading={companyBusy} onClick={() => { void changeCompany({ isFavorite: !application.isCompanyFavorite }); }} /></Tooltip>
          {editingCompanyName ? <Space.Compact className="drawer-company-name-editor"><Input autoFocus value={companyNameDraft} maxLength={100} onChange={(event) => setCompanyNameDraft(event.target.value)} onPressEnter={() => { void commitCompanyName(); }} onKeyDown={(event) => { if (event.key === "Escape") { setCompanyNameDraft(application.companyName); setEditingCompanyName(false); } }} onBlur={() => { void commitCompanyName(); }} /><Button aria-label="取消编辑公司名称" icon={<CloseOutlined />} onMouseDown={(event) => event.preventDefault()} onClick={() => { setCompanyNameDraft(application.companyName); setEditingCompanyName(false); }} /></Space.Compact> : <span className="drawer-company-name-wrap"><Typography.Title id="application-company-name" level={3}>{application.companyName}</Typography.Title><Button type="text" size="small" className="drawer-inline-edit-button" aria-label="编辑公司名称" icon={<EditOutlined />} onClick={() => { setCompanyNameDraft(application.companyName); setEditingCompanyName(true); }} /></span>}
        </div>
        <StatusBadge status={application.currentStatus} />
      </div>
      <Typography.Text className="drawer-primary-position">{positionRows[0]?.title ?? "未填写第一志愿"}</Typography.Text>
      <div className="drawer-company-meta" aria-label="投递摘要">
        <span className="drawer-meta-chip drawer-priority-chip">{positionLabel(1)}</span>
        <Tooltip title="编辑公司分类">
          <Dropdown open={categoryOpen} onOpenChange={(nextOpen) => { setCategoryOpen(nextOpen); if (!nextOpen) setNewCategoryOpen(false); }} trigger={["click"]} placement="bottomLeft" popupRender={() => categoryDropdownContent}>
            <Button type="text" size="small" className={`drawer-meta-chip drawer-category-chip drawer-category-${application.companyCategory?.color ?? "empty"}`} loading={companyBusy} aria-label={`编辑公司分类，当前为${application.companyCategory?.name ?? "未分类"}`}>
              <span>{application.companyCategory?.name ?? "未分类"}</span><EditOutlined className="drawer-meta-edit-icon" aria-hidden="true" />
            </Button>
          </Dropdown>
        </Tooltip>
        {editingAppliedAt ? <DatePicker autoFocus className="drawer-inline-date" size="small" value={dayjs(application.appliedAt)} format="YYYY-MM-DD" allowClear={false} suffixIcon={null} disabled={busy !== null} onChange={(value) => { setEditingAppliedAt(false); if (value) void saveApplicationField("application", { appliedAt: value.format("YYYY-MM-DD") }); }} onOpenChange={(isOpen) => { if (!isOpen) setEditingAppliedAt(false); }} /> : <Tooltip title="编辑投递日期"><Button type="text" size="small" className="drawer-meta-date" onClick={() => setEditingAppliedAt(true)} aria-label={`编辑投递日期，当前为${formatDate(application.appliedAt)}`}><CalendarOutlined aria-hidden="true" /><span>投递于 {formatDate(application.appliedAt)}</span><EditOutlined className="drawer-meta-edit-icon" aria-hidden="true" /></Button></Tooltip>}
      </div>
      <Flex gap={8} wrap className="drawer-actions">
        {editingLink ? <Space.Compact className="drawer-link-editor"><Input autoFocus value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} onPressEnter={() => { void commitLink(); }} onKeyDown={(event) => { if (event.key === "Escape") { setLinkDraft(application.applicationUrl); setEditingLink(false); } }} onBlur={() => { void commitLink(); }} /><Button aria-label="取消编辑投递链接" icon={<CloseOutlined />} onMouseDown={(event) => event.preventDefault()} onClick={() => { setLinkDraft(application.applicationUrl); setEditingLink(false); }} /></Space.Compact> : <a className="drawer-link" href={application.applicationUrl} target="_blank" rel="noopener noreferrer"><LinkOutlined />打开投递链接</a>}
        <Dropdown trigger={["click"]} placement="bottomLeft" menu={{ items: [{ key: "edit", icon: <EditOutlined />, label: "修改链接" }, { key: "copy", icon: <CopyOutlined />, label: "复制链接" }], onClick: ({ key }) => { if (key === "edit") { setLinkDraft(application.applicationUrl); setEditingLink(true); } if (key === "copy") void copyLink(); } }}><Button type="text" size="small" className="drawer-link-menu" icon={<MoreOutlined />} aria-label="投递链接更多操作" /></Dropdown>
      </Flex>
      <div className="drawer-summary-facts">
        <div className="drawer-metric"><Typography.Text type="secondary">当前阶段</Typography.Text><Typography.Text strong>{statusVisualConfig[application.currentStatus].label}</Typography.Text></div>
        <div className="drawer-metric"><Typography.Text type="secondary">{rejectionInfo ? "流程持续" : application.currentStatus === "CLOSED" ? "流程状态" : "停留时间"}</Typography.Text><Typography.Text strong>{rejectionInfo ? `${rejectionInfo.durationDays} 天` : application.currentStatus === "CLOSED" ? "已结束" : `${currentStatusDurationDays} 天`}</Typography.Text></div>
        <div className="drawer-metric"><Typography.Text type="secondary">最后动态</Typography.Text><Typography.Text strong>{lastActivityLabel}</Typography.Text></div>
        {needsAttention && <span className="drawer-attention"><span aria-hidden="true">⚠</span> 需要跟进</span>}
      </div>
    </section>

    <section className="application-detail-section drawer-progress-section" aria-labelledby="progress-heading">
      <div className="detail-section-heading progress-section-heading">
        <div><Typography.Title id="progress-heading" level={5}>投递进度</Typography.Title><Typography.Text type="secondary">{progressSummary}</Typography.Text></div>
        <Popover open={statusEditorOpen} onOpenChange={(nextOpen) => { setStatusEditorOpen(nextOpen); if (nextOpen) { setStatus(application.currentStatus); setStatusDescription(""); } }} trigger="click" placement="bottomRight" content={statusEditorContent}>
          <Button type="text" size="small" className="status-update-trigger">更新状态</Button>
        </Popover>
      </div>
      <StageRail currentStatus={application.currentStatus} rejectionStage={rejectionInfo?.stageStatus} stageTimes={stageTimes} />
      {rejectionInfo && <div className="rejection-summary"><div><Typography.Text type="secondary">止步阶段</Typography.Text><Typography.Text strong>{rejectionInfo.stage}</Typography.Text></div><div><Typography.Text type="secondary">流程持续</Typography.Text><Typography.Text strong>{rejectionInfo.durationDays} 天</Typography.Text></div></div>}
    </section>

    <section className="application-detail-section" aria-labelledby="positions-heading">
      <div className="detail-section-heading drawer-section-heading-with-action"><Typography.Title id="positions-heading" level={5}>志愿职位</Typography.Title><Button type="text" size="small" className="section-action-trigger" icon={<PlusOutlined />} disabled={busy !== null || positionRows.length >= MAX_APPLICATION_POSITIONS} onClick={addPosition}>添加职位</Button></div>
      <ol className="drawer-position-list">
        {positionRows.map((position, index) => <li key={position.id}>
          <span className="application-position-index">{POSITION_MARKS[index] ?? `${index + 1}`}</span>
          {editingPositionId === position.id ? <Space.Compact className="drawer-position-editor"><Input autoFocus value={positionDraft} placeholder="输入职位名称" maxLength={100} onChange={(event) => setPositionDraft(event.target.value)} onPressEnter={(event) => { event.currentTarget.blur(); }} onKeyDown={(event) => { if (event.key === "Escape") { if (position.id.startsWith("draft-")) setPositionRows((current) => current.filter((item) => item.id !== position.id)); setEditingPositionId(null); setPositionDraft(""); } }} onBlur={() => { void commitPositionTitle(position.id); }} /><Button aria-label="取消编辑职位" icon={<CloseOutlined />} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (position.id.startsWith("draft-")) setPositionRows((current) => current.filter((item) => item.id !== position.id)); setEditingPositionId(null); setPositionDraft(""); }} /></Space.Compact> : <><Tooltip title={position.title} placement="topLeft"><Typography.Text className="drawer-position-title" ellipsis onClick={() => { if (busy === null) { setEditingPositionId(position.id); setPositionDraft(position.title); } }}>{position.title}</Typography.Text></Tooltip><span className="primary-position-label">{positionLabel(index + 1)}</span></>}
          {editingPositionId !== position.id && <span className="drawer-position-actions"><Tooltip title="上移"><Button type="text" size="small" aria-label="上移志愿职位" icon={<ArrowUpOutlined />} disabled={busy !== null || index === 0} onClick={() => { void movePosition(index, -1); }} /></Tooltip><Tooltip title="下移"><Button type="text" size="small" aria-label="下移志愿职位" icon={<ArrowDownOutlined />} disabled={busy !== null || index === positionRows.length - 1} onClick={() => { void movePosition(index, 1); }} /></Tooltip><Tooltip title="删除"><Button type="text" size="small" danger aria-label="删除志愿职位" icon={<DeleteOutlined />} disabled={busy !== null || positionRows.length <= 1} onClick={() => { void removePosition(position); }} /></Tooltip></span>}
        </li>)}
      </ol>
    </section>

    <section className="application-detail-section" aria-labelledby="history-heading">
      <div className="detail-section-heading drawer-section-heading-with-action">
        <div><Typography.Title id="history-heading" level={5}>动态记录</Typography.Title><Typography.Text type="secondary">{timelineEvents.length} 条动态</Typography.Text></div>
        <Popover open={activityOpen} onOpenChange={setActivityOpen} trigger="click" placement="bottomRight" content={<div className="activity-editor-popover"><Input.TextArea autoFocus value={activityNote} onChange={(event) => setActivityNote(event.target.value)} placeholder="例如：联系了 HR，等待回复" maxLength={500} autoSize={{ minRows: 2, maxRows: 4 }} /><Flex justify="end" gap={8}><Button size="small" onClick={() => { setActivityNote(""); setActivityOpen(false); }}>取消</Button><Button type="primary" size="small" icon={<MessageOutlined />} loading={busy === "note"} disabled={busy !== null || !activityNote.trim()} onClick={() => { void addActivityNote(); }}>记录</Button></Flex></div>}>
          <Button type="text" size="small" className="record-activity-trigger" icon={<PlusOutlined />}>记录动态</Button>
        </Popover>
      </div>
      <HistoryTimeline events={displayTimelineEvents} />
    </section>

    <section className="application-detail-section" aria-labelledby="note-heading">
      <div className="detail-section-heading drawer-section-heading-with-action"><Typography.Title id="note-heading" level={5}>备注</Typography.Title>{!editingNote && <Button type="text" size="small" className="note-edit-trigger" onClick={() => { setNoteDraft(application.note ?? ""); setEditingNote(true); }}>{application.note ? "编辑" : <><PlusOutlined /> 添加备注</>}</Button>}</div>
      {editingNote ? <div className="drawer-note-editor"><Input.TextArea autoFocus rows={4} showCount maxLength={2000} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void saveNote(); if (event.key === "Escape") { setNoteDraft(application.note ?? ""); setEditingNote(false); } }} /><Flex justify="end" gap={8}><Button size="small" onClick={() => { setNoteDraft(application.note ?? ""); setEditingNote(false); }}>取消</Button><Button type="primary" size="small" loading={busy === "application"} disabled={busy !== null} onClick={() => { void saveNote(); }}>保存</Button></Flex></div> : <div className={`application-note${application.note ? "" : " is-empty"}`}>{application.note || "暂无备注"}</div>}
    </section>
  </Drawer>;
}
