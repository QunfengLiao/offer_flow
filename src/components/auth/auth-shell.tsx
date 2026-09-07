import Link from "next/link";
import { CarryOutOutlined } from "@ant-design/icons";
import { Card, Divider, Space, Typography } from "antd";

export function AuthShell({ title, eyebrow, description, children, footer }: { title: string; eyebrow: string; description: string; children: React.ReactNode; footer: React.ReactNode }) {
  return <Card className="auth-card" bordered>
    <Link href="/login" className="auth-brand"><span className="auth-brand-mark"><CarryOutOutlined /></span>OfferFlow</Link>
    <Space orientation="vertical" size={4} style={{ display: "flex", marginBottom: 24 }}>
      <Typography.Text type="secondary">{eyebrow}</Typography.Text>
      <Typography.Title level={1} style={{ margin: 0, fontSize: 30 }}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0", lineHeight: 1.7 }}>{description}</Typography.Paragraph>
    </Space>
    {children}
    <Divider style={{ margin: "24px 0 20px" }} />
    <div style={{ textAlign: "center" }}>{footer}</div>
  </Card>;
}
