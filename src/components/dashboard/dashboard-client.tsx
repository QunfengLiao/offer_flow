"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { signOut } from "next-auth/react";
import type { ApplicationStatus } from "@prisma/client";
import { App as AntdApp, Button, Card, Col, Dropdown, Empty, Flex, Input, Modal, Pagination, Row, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import * as echarts from "echarts/core";
import type { EChartsOption } from "echarts";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GraphicComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { AimOutlined, DeleteOutlined, DownloadOutlined, EllipsisOutlined, ExportOutlined, FilterOutlined, InfoCircleOutlined, LogoutOutlined, MessageOutlined, PlusOutlined, SearchOutlined, SettingOutlined, SortAscendingOutlined, StarFilled, StarOutlined, SwapOutlined, UploadOutlined } from "@ant-design/icons";
import { ApplicationDrawer } from "@/components/applications/application-drawer";
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog";
import { ApplicationImportDialog, downloadApplicationTemplate } from "@/components/applications/application-import-dialog";
import { StatusBadge } from "@/components/applications/status-badge";
import { STATUS_GROUPS, STATUS_OPTIONS, isTerminalStatus } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { ApplicationDto, ApplicationSort, ApplicationStatusFilter, DashboardAnalytics } from "@/lib/application-service";
import type { CompanyCategoryDto } from "@/lib/company-service";
import { CategoryManagerDialog } from "@/components/applications/category-manager-dialog";

echarts.use([BarChart, LineChart, PieChart, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type DashboardStats = {
  total: number;
  active: number;
  offers: number;
  rejected: number;
  attentionCount: number;
  favoriteCompanyCount: number;
  attention: ApplicationDto[];
  analytics: DashboardAnalytics;
};

type ApplicationList = { items: ApplicationDto[]; total: number; favoriteCompanyCount: number; page: number; pageSize: number; pageCount: number };
type DashboardFilter = ApplicationStatusFilter | "ALL";

function relativeActivity(date: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (elapsedMinutes < 1) return "刚刚";
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;
  if (elapsedMinutes < 1440) return `${Math.floor(elapsedMinutes / 60)} 小时前`;
  return `${Math.floor(elapsedMinutes / 1440)} 天前`;
}

function compactDate(date: string) {
  const value = new Date(date);
  return `${String(value.getMonth() + 1).padStart(2, "0")}/${String(value.getDate()).padStart(2, "0")}`;
}

function positionList(positions: ApplicationDto["positions"]) {
  const firstPosition = positions[0];
  if (!firstPosition) return <Typography.Text type="secondary">—</Typography.Text>;
  return <div className="position-cell">
    <Tooltip title={firstPosition.title} placement="topLeft">
      <Typography.Text className="position-cell-title" ellipsis>{firstPosition.title}</Typography.Text>
    </Tooltip>
    {positions.length > 1 && <span className="position-cell-count-control" onClick={(event) => event.stopPropagation()}><Tooltip placement="topLeft" title={<div className="position-tooltip-list">{positions.slice(1).map((position) => <div key={position.priority}>第 {position.priority} 志愿：{position.title}</div>)}</div>}><Tag className="position-cell-count" aria-label={`查看其他 ${positions.length - 1} 个志愿职位`}>+{positions.length - 1}</Tag></Tooltip></span>}
  </div>;
}

type TrendRange = keyof DashboardAnalytics["trends"];

const statusChartColors: Record<string, string> = {
  APPLIED: "#94A3B8",
  ASSESSMENT: "#D39B3A",
  WRITTEN_TEST: "#C98512",
  FIRST_INTERVIEW: "#3B82F6",
  SECOND_INTERVIEW: "#6366F1",
  THIRD_INTERVIEW: "#7C3AED",
  HR_INTERVIEW: "#0F9F8D",
  OFFER: "#16866E",
  REJECTED: "#D15C65",
  CLOSED: "#B8C0CC",
};

const categoryChartColors = ["#2563EB", "#16866E", "#D39B3A", "#7C3AED", "#0F9F8D", "#C9575C", "#64748B", "#A8B4C4"];

function formatPercent(count: number, total: number) {
  return total === 0 ? "0%" : `${Math.round((count / total) * 100)}%`;
}

function AnalyticsCard({ title, description, children, action, className = "" }: { title: string; description: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return <Card className={`dashboard-card analytics-card ${className}`}>
    <div className="analytics-card-heading"><div className="analytics-card-copy"><Typography.Title level={4}>{title}</Typography.Title><Typography.Text type="secondary">{description}</Typography.Text></div>{action && <div className="analytics-card-action">{action}</div>}</div>
    {children}
  </Card>;
}

function EChartsChart({ option, className = "", ariaLabel }: { option: EChartsOption; className?: string; ariaLabel: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={containerRef} className={`echarts-chart ${className}`} role="img" aria-label={ariaLabel} />;
}

function StatusDistributionChart({ analytics, total }: { analytics: DashboardAnalytics; total: number }) {
  const visibleData = analytics.statusDistribution.filter((item) => item.count > 0);
  const option: EChartsOption = {
    animation: true,
    animationDuration: 260,
    animationDurationUpdate: 180,
    tooltip: { trigger: "item", formatter: "{b}<br/>{c} 条投递 ({d}%)" },
    legend: {
      type: "scroll",
      orient: "vertical",
      left: "52%",
      top: "middle",
      width: "44%",
      itemWidth: 7,
      itemHeight: 7,
      itemGap: 8,
      selectedMode: false,
      textStyle: { color: "#667085", fontSize: 11 },
      formatter: (name: string) => {
        const item = visibleData.find((entry) => entry.label === name);
        return item ? `${name}  ${item.count}  ${formatPercent(item.count, total)}` : name;
      },
      data: visibleData.map((item) => item.label),
    },
    series: [{
      type: "pie",
      center: ["27%", "50%"],
      radius: ["52%", "74%"],
      avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 4, itemStyle: { shadowBlur: 8, shadowColor: "rgba(15, 23, 42, .16)" } },
      data: visibleData.map((item) => ({ name: item.label, value: item.count, itemStyle: { color: statusChartColors[item.status] ?? "#94A3B8" } })),
    }],
  };
  return <AnalyticsCard title="投递状态分布" description="按当前状态统计" className="status-analytics-card">
    {visibleData.length === 0 ? <Empty className="analytics-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无投递数据" /> : <div className="status-chart-wrap">
      <EChartsChart option={option} className="status-echarts-chart" ariaLabel={`当前投递状态分布，共 ${total} 条`} />
      <div className="status-chart-center" aria-hidden="true">
        <span className="status-chart-total">{total}</span>
        <span className="status-chart-caption">条投递</span>
      </div>
    </div>}
  </AnalyticsCard>;
}

function TrendChart({ analytics }: { analytics: DashboardAnalytics }) {
  const [range, setRange] = useState<TrendRange>("month");
  const series = analytics.trends[range];
  const maxCount = Math.max(1, ...series.map((item) => item.count));
  const labelIndexes = series.length <= 6
    ? series.map((_, index) => index)
    : [...new Set([0, Math.floor((series.length - 1) / 4), Math.floor((series.length - 1) / 2), Math.floor(((series.length - 1) * 3) / 4), series.length - 1])];
  const option: EChartsOption = {
    animation: true,
    animationDuration: 260,
    animationDurationUpdate: 180,
    tooltip: { trigger: "axis", axisPointer: { type: "line" } },
    grid: { top: 14, right: 10, bottom: 30, left: 30, containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: series.map((item) => item.label), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#9AA6B6", fontSize: 10, interval: (index: number) => !labelIndexes.includes(index) } },
    yAxis: { type: "value", min: 0, max: maxCount, splitNumber: 2, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#9AA6B6", fontSize: 10 }, splitLine: { lineStyle: { color: "#EDF1F5" } } },
    series: [{ type: "line", name: "投递数量", data: series.map((item) => item.count), symbol: "circle", symbolSize: 7, showSymbol: true, lineStyle: { color: "#2563EB", width: 2.5 }, itemStyle: { color: "#FFFFFF", borderColor: "#2563EB", borderWidth: 2 }, emphasis: { scale: true, itemStyle: { color: "#EEF4FF", borderColor: "#2563EB", borderWidth: 2.5 } } }],
  };
  return <AnalyticsCard title="投递趋势" description="按投递日期统计" action={<div className="trend-range-tabs" role="tablist" aria-label="投递趋势时间范围">
    {(["week", "month", "year"] as TrendRange[]).map((item) => <button type="button" role="tab" aria-selected={range === item} className={`trend-range-tab${range === item ? " is-active" : ""}`} key={item} onClick={() => setRange(item)}>{item === "week" ? "周" : item === "month" ? "月" : "年"}</button>)}
  </div>} className="trend-analytics-card">
    <div className="trend-chart-wrap"><EChartsChart option={option} className="trend-echarts-chart" ariaLabel="投递数量趋势" /></div>
  </AnalyticsCard>;
}

function CategoryDistributionChart({ analytics, total }: { analytics: DashboardAnalytics; total: number }) {
  const maxCount = Math.max(1, ...analytics.categoryDistribution.map((item) => item.count));
  return <AnalyticsCard title="公司分类分布" description="按投递数量统计" className="category-analytics-card">
    {analytics.categoryDistribution.length === 0 ? <Empty className="analytics-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无公司分类数据" /> : <div className="category-distribution-list" role="list" aria-label="公司分类投递分布">
      {analytics.categoryDistribution.map((item, index) => {
        const color = categoryChartColors[index % categoryChartColors.length];
        const percentage = (item.count / maxCount) * 100;
        return <div className="category-distribution-row" role="listitem" key={item.label}>
          <span className="category-distribution-label" title={item.label}>{item.label}</span>
          <div className="category-distribution-bar" role="progressbar" aria-label={`${item.label}：${item.count} 条投递`} aria-valuemin={0} aria-valuemax={maxCount} aria-valuenow={item.count}>
            <span className="category-distribution-bar-fill" style={{ width: `${percentage}%`, backgroundColor: color }} />
          </div>
          <span className="category-distribution-count">{item.count}</span>
          <span className="category-distribution-percent">{formatPercent(item.count, total)}</span>
        </div>;
      })}
    </div>}
  </AnalyticsCard>;
}

function DashboardAnalytics({ analytics, total }: { analytics: DashboardAnalytics; total: number }) {
  return <Row gutter={[16, 16]} className="dashboard-analytics-grid">
    <Col xs={24} lg={8}><StatusDistributionChart analytics={analytics} total={total} /></Col>
    <Col xs={24} lg={8}><TrendChart analytics={analytics} /></Col>
    <Col xs={24} lg={8}><CategoryDistributionChart analytics={analytics} total={total} /></Col>
  </Row>;
}

function statusFilterLabel(status: DashboardFilter) {
  if (status === "ALL") return "";
  if (status === "ACTIVE") return "进行中";
  return STATUS_OPTIONS.find(([value]) => value === status)?.[1] ?? status;
}

export function DashboardClient({ user, initialStats, initialList, initialCategories }: { user: { username: string; email: string }; initialStats: DashboardStats; initialList: ApplicationList; initialCategories: CompanyCategoryDto[] }) {
  const [stats, setStats] = useState(initialStats);
  const [list, setList] = useState(initialList);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<DashboardFilter>("ALL");
  const [attention, setAttention] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [categoryId, setCategoryId] = useState<string | "ALL" | "UNCATEGORIZED">("ALL");
  const [categories, setCategories] = useState(initialCategories);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryManagerCreate, setCategoryManagerCreate] = useState(false);
  const [sort, setSort] = useState<ApplicationSort>("statusPriority");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialList.pageSize);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<ApplicationDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApplicationDto | null>(null);
  const [companyBusyId, setCompanyBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const recordsSectionRef = useRef<HTMLElement>(null);
  const lastLoadedListState = useRef(`1|${initialList.pageSize}|statusPriority|asc|false|false|ALL|ALL|`);
  const { message } = AntdApp.useApp();

  const loadDashboard = async () => {
    try {
      const response = await fetch("/api/dashboard");
      const body = await response.json();
      if (response.ok) setStats(body.data);
    } catch {
      message.error("概览加载失败，请刷新重试");
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch("/api/categories");
      const body = await response.json();
      if (response.ok) setCategories(body.data);
    } catch { /* category counts can refresh with the next page load */ }
  };

  const loadList = async () => {
    const requestId = ++listRequestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, direction });
      if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
      if (status !== "ALL") params.set("status", status);
      if (attention) params.set("attention", "true");
      if (favorite) params.set("favorite", "true");
      if (categoryId !== "ALL") params.set("categoryId", categoryId);
      const response = await fetch(`/api/applications?${params.toString()}`);
      const body = await response.json();
      if (response.ok && requestId === listRequestId.current) setList(body.data);
      else if (!response.ok && requestId === listRequestId.current) message.error(body.error?.message || "列表加载失败");
    } catch {
      if (requestId === listRequestId.current) message.error("列表加载失败，请检查网络后重试");
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  // The server has already supplied initialList. Subsequent state changes refresh it.
  useEffect(() => {
    const requestState = `${page}|${pageSize}|${sort}|${direction}|${attention}|${favorite}|${categoryId}|${status}|${debouncedQuery}`;
    if (lastLoadedListState.current === requestState) return;
    lastLoadedListState.current = requestState;
    void loadList();
    // loadList deliberately follows the filter state rather than its recreated function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sort, direction, attention, favorite, categoryId, status, debouncedQuery]);

  const refresh = () => { void loadDashboard(); void loadList(); };
  const openCreate = () => { setDialogOpen(true); };
  const onSaved = (application: ApplicationDto) => { setSelected(application); refresh(); };
  const onChanged = (application: ApplicationDto) => {
    setSelected(application);
    setList((current) => ({ ...current, items: current.items.map((item) => item.id === application.id ? application : item) }));
    refresh();
  };
  const openApplicationDetails = async (application: ApplicationDto) => {
    const requestId = ++detailRequestId.current;
    setSelected(application);
    try {
      const response = await fetch(`/api/applications/${application.id}`);
      const body = await response.json();
      if (response.ok && requestId === detailRequestId.current) setSelected(body.data);
      else if (!response.ok && requestId === detailRequestId.current) message.error(body.error?.message || "详情加载失败");
    } catch {
      if (requestId === detailRequestId.current) message.error("详情加载失败，请检查网络后重试");
    }
  };
  const hasFilterSummary = Boolean(query.trim()) || status !== "ALL" || categoryId !== "ALL";
  const clearFilters = () => { setQuery(""); setStatus("ALL"); setAttention(false); setFavorite(false); setCategoryId("ALL"); setPage(1); };
  const selectView = (next: "ALL" | "ATTENTION" | "FAVORITES") => {
    setStatus("ALL");
    setAttention(next === "ATTENTION");
    setFavorite(next === "FAVORITES");
    setSort("inactive");
    setDirection(next === "ATTENTION" ? "desc" : "asc");
    setPage(1);
  };
  const updateCompany = async (application: ApplicationDto, patch: { categoryId?: string | null; isFavorite?: boolean }, categoryOverride?: CompanyCategoryDto | null) => {
    try {
      const response = await fetch(`/api/companies/${application.companyId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const body = await response.json();
      if (!response.ok) { message.error(body.error?.message || "公司信息更新失败"); return false; }
      const category = categoryOverride ?? categories.find((item) => item.id === body.data.categoryId) ?? null;
      const sync = (item: ApplicationDto): ApplicationDto => item.companyId === application.companyId ? { ...item, isCompanyFavorite: body.data.isFavorite, companyCategory: category ? { id: category.id, name: category.name, color: category.color } : null } : item;
      setList((current) => ({ ...current, items: current.items.map(sync) }));
      setSelected((current) => current ? sync(current) : current);
      void loadDashboard();
      void loadCategories();
      return true;
    } catch { message.error("公司信息更新失败，请检查网络后重试"); return false; }
  };
  const toggleCompanyFavorite = async (application: ApplicationDto) => {
    setCompanyBusyId(application.companyId);
    try {
      await updateCompany(application, { isFavorite: !application.isCompanyFavorite });
    } finally {
      setCompanyBusyId(null);
    }
  };

  const scrollToRecords = () => {
    const section = recordsSectionRef.current;
    if (!section) return;
    const headerHeight = document.querySelector<HTMLElement>(".dashboard-header")?.offsetHeight ?? 0;
    window.scrollTo({ top: Math.max(0, window.scrollY + section.getBoundingClientRect().top - headerHeight - 12), behavior: "smooth" });
  };

  const handlePaginationChange = (nextPage: number, nextPageSize: number) => {
    const pageSizeChanged = nextPageSize !== pageSize;
    setPageSize(nextPageSize);
    setPage(pageSizeChanged ? 1 : nextPage);
    scrollToRecords();
  };

  const handleTableChange = (_pagination: unknown, _filters: unknown, sorter: SorterResult<ApplicationDto> | SorterResult<ApplicationDto>[]) => {
    const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    const sortKey = activeSorter?.columnKey;
    const sortableFields: ApplicationSort[] = ["inactive", "companyName", "position", "appliedAt", "currentStatus", "lastActivityAt"];
    if (!activeSorter?.order || typeof sortKey !== "string" || !sortableFields.includes(sortKey as ApplicationSort)) {
      setSort("statusPriority");
      setDirection("asc");
      setPage(1);
      return;
    }
    setSort(sortKey as ApplicationSort);
    setDirection(activeSorter.order === "descend" ? "desc" : "asc");
    setPage(1);
  };

  const columns: ColumnsType<ApplicationDto> = [
    {
      title: "公司",
      dataIndex: "companyName",
      key: "companyName",
      width: 280,
      sorter: true,
      sortOrder: sort === "companyName" ? (direction === "asc" ? "ascend" : "descend") : undefined,
      render: (_value, application) => <div className="company-cell">
        <span className="company-name-row">
          <a className="company-link" href={application.applicationUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
            <Typography.Text strong ellipsis={{ tooltip: application.companyName }}>{application.companyName}</Typography.Text>
            <ExportOutlined className="company-external-icon" />
          </a>
          <span className="company-favorite-control" onClick={(event) => event.stopPropagation()}>
            <Tooltip title={application.isCompanyFavorite ? "取消收藏公司" : "收藏公司"}>
              <Button type="text" size="small" className={`company-favorite-button${application.isCompanyFavorite ? " is-favorite" : ""}`} icon={application.isCompanyFavorite ? <StarFilled /> : <StarOutlined />} aria-label={`${application.isCompanyFavorite ? "取消收藏" : "收藏"}${application.companyName}`} loading={companyBusyId === application.companyId} onClick={() => { void toggleCompanyFavorite(application); }} />
            </Tooltip>
          </span>
        </span>
        <span className="company-category-row">
          {application.companyCategory ? <Tooltip title={`公司分类：${application.companyCategory.name}`}><Tag className={`company-category-badge company-category-${application.companyCategory.color}`}><span className="company-category-dot" />{application.companyCategory.name}</Tag></Tooltip> : <Tag className="company-category-badge company-category-empty"><span className="company-category-dot" />未分类</Tag>}
        </span>
      </div>,
    },
    { title: "志愿职位", key: "position", width: 380, sorter: true, sortOrder: sort === "position" ? (direction === "asc" ? "ascend" : "descend") : undefined, render: (_value, application) => positionList(application.positions) },
    { title: "当前状态", dataIndex: "currentStatus", key: "currentStatus", width: 120, sorter: true, sortOrder: sort === "currentStatus" ? (direction === "asc" ? "ascend" : "descend") : undefined, render: (value: ApplicationStatus) => <span className="table-status-cell"><StatusBadge status={value} /></span> },
    { title: "投递日期", dataIndex: "appliedAt", key: "appliedAt", width: 98, sorter: true, sortOrder: sort === "appliedAt" ? (direction === "asc" ? "ascend" : "descend") : undefined, render: (value: string) => <Tooltip title={`投递于 ${formatDateTime(value)}`}><Typography.Text className="table-cell-ellipsis compact-date" type="secondary" ellipsis>{compactDate(value)}</Typography.Text></Tooltip> },
    { title: "最近动态", dataIndex: "lastActivityAt", key: "lastActivityAt", width: 120, sorter: true, sortOrder: sort === "lastActivityAt" ? (direction === "asc" ? "ascend" : "descend") : undefined, render: (value: string) => <Tooltip title={`最后动态：${formatDateTime(value)}`}><Typography.Text className="table-cell-ellipsis relative-time" type="secondary" ellipsis>{relativeActivity(value)}</Typography.Text></Tooltip> },
    {
      title: "操作",
      key: "action",
      fixed: "right",
      width: 56,
      render: (_value, application) => <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: [
        { key: "view", icon: <InfoCircleOutlined />, label: "查看详情" },
        { key: "link", icon: <ExportOutlined />, label: <a href={application.applicationUrl} target="_blank" rel="noopener noreferrer">打开投递链接</a> },
        { type: "divider" },
        { key: "note", icon: <MessageOutlined />, label: "记录动态" },
        { key: "status", icon: <SwapOutlined />, label: "修改状态" },
        { type: "divider" },
        { key: "delete", danger: true, icon: <DeleteOutlined />, label: "删除" },
      ], onClick: ({ key, domEvent }) => {
        domEvent.stopPropagation();
        if (key === "view") void openApplicationDetails(application);
        if (key === "note" || key === "status") void openApplicationDetails(application);
        if (key === "delete") setDeleteTarget(application);
      } }}>
        <Button type="text" size="small" className="table-action-button" icon={<EllipsisOutlined />} aria-label={`更多操作 ${application.companyName}`} onClick={(event) => event.stopPropagation()} />
      </Dropdown>,
    },
  ];

  const statusOptions = [{ value: "ALL", label: "全部状态" }, { value: "ACTIVE", label: "进行中（未结束）" }, ...STATUS_GROUPS.map((group) => ({ label: group.label, options: group.options.map(([value, label]) => ({ value, label })) }))];

  const deleteApplication = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/applications/${deleteTarget.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) { message.error(body.error?.message || "删除失败"); return; }
      message.success("投递已删除");
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      refresh();
    } catch {
      message.error("删除失败，请检查网络后重试");
    } finally {
      setDeleting(false);
    }
  };

  return <div>
    <header className="dashboard-header">
      <div className="dashboard-brand"><span className="dashboard-brand-mark"><AimOutlined /></span><span><span className="dashboard-brand-name">OfferFlow</span><span className="dashboard-brand-subtitle">/ 从投递到 Offer，让每一次投递都有迹可循</span></span></div>
      <div className="dashboard-user"><div className="dashboard-user-copy"><Typography.Text strong>{user.username}</Typography.Text><Typography.Text type="secondary" className="dashboard-user-email">{user.email}</Typography.Text></div><Button type="text" icon={<LogoutOutlined />} onClick={() => signOut({ callbackUrl: "/login" })}>退出</Button></div>
    </header>

    <main className="dashboard-content">
      <div className="dashboard-analytics-wrap"><DashboardAnalytics analytics={stats.analytics} total={stats.total} /></div>

      <div className="dashboard-main-row">
        <section ref={recordsSectionRef} className="dashboard-list-col" aria-labelledby="application-records-heading">
          <Card className="dashboard-card dashboard-table-card">
            <div className="dashboard-table-toolbar">
              <div className="dashboard-table-toolbar-top">
                <div className="dashboard-table-heading">
                  <Typography.Title id="application-records-heading" level={4} style={{ margin: 0 }}>投递记录</Typography.Title>
                  <Typography.Text type="secondary">{list.total} 条投递</Typography.Text>
                </div>
                <div className="dashboard-table-actions">
                  <Button type="link" icon={<DownloadOutlined />} onClick={downloadApplicationTemplate}>下载模板</Button>
                  <Button type="link" icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>导入记录</Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增投递</Button>
                </div>
              </div>
              <div className="dashboard-table-toolbar-bottom">
                <div className="dashboard-view-tabs" role="tablist" aria-label="投递记录视图">
                  <button type="button" role="tab" aria-selected={!attention && !favorite} className={`dashboard-view-tab${!attention && !favorite ? " is-active" : ""}`} onClick={() => selectView("ALL")}>
                    <span>全部</span><span className="dashboard-view-count">{stats.total}</span>
                  </button>
                  <button type="button" role="tab" aria-selected={attention} className={`dashboard-view-tab${attention ? " is-active" : ""}`} onClick={() => selectView("ATTENTION")}>
                    <span>需关注</span><span className="dashboard-view-count">{stats.attentionCount}</span>
                  </button>
                  <button type="button" role="tab" aria-selected={favorite} className={`dashboard-view-tab${favorite ? " is-active" : ""}`} onClick={() => selectView("FAVORITES")}>
                    <span>收藏</span><span className="dashboard-view-count">{stats.favoriteCompanyCount}</span>
                  </button>
                </div>
                <div className="dashboard-table-filters">
                <Input allowClear prefix={<SearchOutlined />} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索公司或职位…" />
                <Select className="filter-status" value={status} onChange={(value) => { const nextStatus = value as DashboardFilter; setStatus(nextStatus); if (attention && nextStatus !== "ACTIVE" && nextStatus !== "ALL" && isTerminalStatus(nextStatus)) setAttention(false); setPage(1); }} suffixIcon={<FilterOutlined />} options={statusOptions} />
                <Select className="filter-category" value={categoryId} onChange={(value) => { if (value === "__new" || value === "__manage") { setCategoryManagerCreate(value === "__new"); setCategoryManagerOpen(true); return; } setCategoryId(value); setPage(1); }} options={[{ value: "ALL", label: "全部分类" }, { value: "UNCATEGORIZED", label: "未分类" }, ...categories.map((category) => ({ value: category.id, label: category.name })), { value: "__new", label: <><PlusOutlined /> 新建分类</> }, { value: "__manage", label: <><SettingOutlined /> 管理分类</> }]} />
                <Button className="filter-category-manage" icon={<SettingOutlined />} onClick={() => { setCategoryManagerCreate(false); setCategoryManagerOpen(true); }}>管理分类</Button>
                <Select className="filter-sort" value={`${sort}-${direction}`} onChange={(value) => { const [nextSort, nextDirection] = value.split("-") as [ApplicationSort, "asc" | "desc"]; setSort(nextSort); setDirection(nextDirection); setPage(1); }} suffixIcon={<SortAscendingOutlined />} options={[{ value: "statusPriority-asc", label: "状态优先级" }, { value: "inactive-asc", label: "无动态天数 ↑" }, { value: "inactive-desc", label: "无动态天数 ↓" }, { value: "appliedAt-desc", label: "投递日期 新→旧" }, { value: "appliedAt-asc", label: "投递日期 旧→新" }, { value: "lastActivityAt-desc", label: "最后动态 新→旧" }, { value: "lastActivityAt-asc", label: "最后动态 旧→新" }, { value: "companyName-asc", label: "公司名称 A→Z" }, { value: "companyName-desc", label: "公司名称 Z→A" }, { value: "position-asc", label: "志愿职位 A→Z" }, { value: "position-desc", label: "志愿职位 Z→A" }, { value: "currentStatus-asc", label: "当前状态 正序" }, { value: "currentStatus-desc", label: "当前状态 倒序" }]} />
                </div>
              </div>
            </div>
            {attention && <div className="attention-filter-note">显示尚未结束且超过 7 天没有动态的投递，按无动态天数从高到低排列。</div>}
            {hasFilterSummary && <div className="dashboard-filter-summary"><Space wrap size={[8, 8]}>
              {query.trim() && <Tag closable onClose={() => { setQuery(""); setPage(1); }}>搜索：{query.trim()}</Tag>}
              {status !== "ALL" && <Tag closable onClose={() => { setStatus("ALL"); setPage(1); }}>状态：{statusFilterLabel(status)}</Tag>}
              {categoryId !== "ALL" && <Tag closable onClose={() => { setCategoryId("ALL"); setPage(1); }}>分类：{categoryId === "UNCATEGORIZED" ? "未分类" : categories.find((item) => item.id === categoryId)?.name}</Tag>}
              <Button type="link" size="small" onClick={clearFilters}>清除筛选</Button>
            </Space></div>}
            <Table<ApplicationDto> className="dashboard-table" rowKey="id" size="middle" loading={loading} columns={columns} dataSource={list.items} pagination={false} tableLayout="fixed" scroll={{ x: 1054 }} onChange={handleTableChange} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilterSummary || attention || favorite ? "没有符合条件的投递" : "还没有投递记录"} /> }} rowClassName={(application, index) => `${index === 0 || list.items[index - 1]?.currentStatus !== application.currentStatus ? "application-table-row status-group-start" : "application-table-row"} status-group-${application.currentStatus.toLowerCase()}`} onRow={(application) => ({ onClick: () => { void openApplicationDetails(application); }, style: { cursor: "pointer" } })} />
            <Flex align="center" justify="space-between" wrap gap={12} className="dashboard-pagination"><Typography.Text type="secondary">共 {list.total} 条</Typography.Text><Flex align="center" gap={8} className="pagination-controls"><Pagination current={list.page} total={list.total} pageSize={pageSize} pageSizeOptions={["10", "20", "50"]} showSizeChanger showLessItems locale={{ items_per_page: "条/页" }} showTotal={(total, range) => `${range[0]}–${range[1]} / 共 ${total} 条`} size="small" onChange={handlePaginationChange} /></Flex></Flex>
          </Card>
        </section>
      </div>
    </main>

    <ApplicationFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={onSaved} categories={categories} onCategoriesChange={setCategories} />
    <ApplicationImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={refresh} />
    <ApplicationDrawer open={Boolean(selected)} application={selected} onOpenChange={(open) => { if (!open) setSelected(null); }} onDelete={() => { if (selected) setDeleteTarget(selected); }} onChanged={onChanged} categories={categories} onCategoriesChange={setCategories} onCompanyChanged={updateCompany} />
    <CategoryManagerDialog open={categoryManagerOpen} onOpenChange={(open) => { setCategoryManagerOpen(open); if (!open) setCategoryManagerCreate(false); }} categories={categories} createOnOpen={categoryManagerCreate} onCategoriesChange={(next) => { setCategories(next); refresh(); }} />
    <Modal open={Boolean(deleteTarget)} title="删除这条投递？" onCancel={() => { if (!deleting) setDeleteTarget(null); }} onOk={deleteApplication} okText="确认删除" cancelText="取消" okButtonProps={{ danger: true }} confirmLoading={deleting}>
      <Typography.Paragraph>将删除“{deleteTarget?.companyName}”的投递信息与全部历史动态，此操作无法撤销。</Typography.Paragraph>
    </Modal>
  </div>;
}
