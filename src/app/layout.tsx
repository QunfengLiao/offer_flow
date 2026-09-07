import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntdApp, ConfigProvider } from "antd";
import "./globals.css";

export const metadata: Metadata = {
  title: "OfferFlow | 从投递到 Offer",
  description: "从投递到 Offer，让每一次投递都有迹可循。",
};

const theme = {
  token: {
    colorPrimary: "#2f6fed",
    colorInfo: "#2f6fed",
    colorSuccess: "#16866e",
    colorWarning: "#ba7a03",
    colorError: "#c9575c",
    colorBgLayout: "#f4f7fb",
    colorBgContainer: "#ffffff",
    colorText: "#172033",
    colorTextSecondary: "#748197",
    fontSize: 14,
    borderRadius: 9,
    borderRadiusLG: 12,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif",
  },
  components: {
    Button: {
      controlHeight: 40,
      controlHeightSM: 32,
    },
    Input: {
      controlHeight: 42,
    },
    Select: {
      controlHeight: 42,
    },
    DatePicker: {
      controlHeight: 42,
    },
    Card: {
      headerFontSize: 16,
    },
    Table: {
      headerBg: "#fafafa",
      rowHoverBg: "#f0f5ff",
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AntdRegistry><ConfigProvider theme={theme}><AntdApp>{children}</AntdApp></ConfigProvider></AntdRegistry></body></html>;
}
