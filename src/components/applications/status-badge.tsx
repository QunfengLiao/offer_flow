import type { ApplicationStatus } from "@prisma/client";
import { Tag } from "antd";
import { statusVisualConfig } from "@/lib/constants";

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const visual = statusVisualConfig[status];
  return <Tag className="status-badge" style={{ color: visual.textColor, backgroundColor: visual.backgroundColor, borderColor: visual.borderColor }}>
    <span className="status-badge-dot" style={{ backgroundColor: visual.dotColor }} />{visual.label}
  </Tag>;
}
