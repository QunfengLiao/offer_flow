"use client";

import Link from "next/link";
import { ArrowRightOutlined, LoginOutlined } from "@ant-design/icons";
import { Alert, Button, Form, Input } from "antd";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { AuthShell } from "./auth-shell";

const loginSchema = z.object({ email: z.string().email("请输入有效的邮箱地址"), password: z.string().min(1, "请输入密码") });
type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [form] = Form.useForm<LoginValues>();
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (values: LoginValues) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      form.setFields(parsed.error.issues.map((issue) => ({ name: issue.path[0] as keyof LoginValues, errors: [issue.message] })));
      return;
    }

    setServerError("");
    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", { email: values.email, password: values.password, redirect: false, callbackUrl: "/dashboard" });
      if (result?.error) setServerError("邮箱或密码不正确，请重试");
      else window.location.href = result?.url || "/dashboard";
    } finally {
      setIsSubmitting(false);
    }
  };

  return <AuthShell eyebrow="秋招作战台" title="欢迎回来" description="把每一次投递都变成清晰的下一步。" footer={<>还没有账号？<Link href="/register" style={{ marginLeft: 4, color: "#1677ff" }}>创建账号 <ArrowRightOutlined /></Link></>}>
    <Form<LoginValues> form={form} layout="vertical" requiredMark={false} onFinish={onSubmit}>
      <Form.Item label="邮箱" name="email" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效的邮箱地址" }]}>
        <Input type="email" autoComplete="email" placeholder="you@example.com" />
      </Form.Item>
      <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
        <Input.Password autoComplete="current-password" placeholder="输入密码" />
      </Form.Item>
      {serverError && <Alert showIcon type="error" message={serverError} style={{ marginBottom: 24 }} />}
      <Button type="primary" htmlType="submit" block loading={isSubmitting} icon={<LoginOutlined />}>登录</Button>
    </Form>
  </AuthShell>;
}
