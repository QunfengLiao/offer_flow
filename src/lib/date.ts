import { differenceInCalendarDays, startOfDay } from "date-fns";
import { ApplicationStatus } from "@prisma/client";
import { isTerminalStatus } from "./constants";

export function getInactiveDays(appliedAt: Date | string, today = new Date()) {
  return Math.max(0, differenceInCalendarDays(startOfDay(today), startOfDay(new Date(appliedAt))));
}

export function getReminderLevel(days: number, status: ApplicationStatus) {
  if (isTerminalStatus(status) || days < 7) return "normal" as const;
  if (days < 14) return "warning" as const;
  return "danger" as const;
}

export function toDateOnlyAtNoon(value: string) {
  return new Date(`${value}T12:00:00`);
}
