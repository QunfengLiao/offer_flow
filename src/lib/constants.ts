import type { ApplicationStatus, EventType } from "@prisma/client";

export const MAX_APPLICATION_POSITIONS = 5;

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: "已投递",
  ASSESSMENT: "测评",
  WRITTEN_TEST: "笔试",
  FIRST_INTERVIEW: "一面",
  SECOND_INTERVIEW: "二面",
  THIRD_INTERVIEW: "三面",
  HR_INTERVIEW: "HR 面",
  OFFER: "Offer",
  REJECTED: "已被拒",
  CLOSED: "流程结束",
};

export type StatusVisual = {
  label: string;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
  dotColor: string;
  stageOrder: number;
};

/** The single source of truth for every status treatment in the product. */
export const statusVisualConfig: Record<ApplicationStatus, StatusVisual> = {
  APPLIED: { label: "已投递", textColor: "#475569", backgroundColor: "#F1F5F9", borderColor: "#F1F5F9", dotColor: "#64748B", stageOrder: 1 },
  ASSESSMENT: { label: "测评", textColor: "#9A6700", backgroundColor: "#FFF7E8", borderColor: "#FFF7E8", dotColor: "#C98512", stageOrder: 2 },
  WRITTEN_TEST: { label: "笔试", textColor: "#A16207", backgroundColor: "#FFFBEB", borderColor: "#FFFBEB", dotColor: "#D09A13", stageOrder: 3 },
  FIRST_INTERVIEW: { label: "一面", textColor: "#1D4ED8", backgroundColor: "#EFF6FF", borderColor: "#EFF6FF", dotColor: "#3B82F6", stageOrder: 4 },
  SECOND_INTERVIEW: { label: "二面", textColor: "#4338CA", backgroundColor: "#EEF2FF", borderColor: "#EEF2FF", dotColor: "#6366F1", stageOrder: 5 },
  THIRD_INTERVIEW: { label: "三面", textColor: "#6D28D9", backgroundColor: "#F5F3FF", borderColor: "#F5F3FF", dotColor: "#8B5CF6", stageOrder: 6 },
  HR_INTERVIEW: { label: "HR 面", textColor: "#0F766E", backgroundColor: "#F0FDFA", borderColor: "#F0FDFA", dotColor: "#14B8A6", stageOrder: 7 },
  OFFER: { label: "Offer", textColor: "#15803D", backgroundColor: "#F0FDF4", borderColor: "#F0FDF4", dotColor: "#22C55E", stageOrder: 8 },
  REJECTED: { label: "已被拒", textColor: "#B42318", backgroundColor: "#FFF1F2", borderColor: "#FFF1F2", dotColor: "#D15C65", stageOrder: 9 },
  CLOSED: { label: "流程结束", textColor: "#64748B", backgroundColor: "#F8FAFC", borderColor: "#F8FAFC", dotColor: "#94A3B8", stageOrder: 10 },
};

export const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [ApplicationStatus, string][];
export const STATUS_GROUPS: { label: string; options: [ApplicationStatus, string][] }[] = [
  { label: "结果", options: [["OFFER", STATUS_LABELS.OFFER]] },
  { label: "面试中", options: [["THIRD_INTERVIEW", STATUS_LABELS.THIRD_INTERVIEW], ["SECOND_INTERVIEW", STATUS_LABELS.SECOND_INTERVIEW], ["FIRST_INTERVIEW", STATUS_LABELS.FIRST_INTERVIEW], ["HR_INTERVIEW", STATUS_LABELS.HR_INTERVIEW]] },
  { label: "推进中", options: [["WRITTEN_TEST", STATUS_LABELS.WRITTEN_TEST], ["ASSESSMENT", STATUS_LABELS.ASSESSMENT]] },
  { label: "初始", options: [["APPLIED", STATUS_LABELS.APPLIED]] },
  { label: "终止", options: [["REJECTED", STATUS_LABELS.REJECTED], ["CLOSED", STATUS_LABELS.CLOSED]] },
];
export const TERMINAL_STATUSES: ApplicationStatus[] = ["OFFER", "REJECTED", "CLOSED"] as ApplicationStatus[];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  STATUS_CHANGE: "状态变更",
  NOTE: "普通动态",
};

export function isTerminalStatus(status: ApplicationStatus) {
  return TERMINAL_STATUSES.includes(status);
}
