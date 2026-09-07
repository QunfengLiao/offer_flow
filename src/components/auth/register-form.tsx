"use client";

import Link from "next/link";
import { ArrowRightOutlined, UserAddOutlined } from "@ant-design/icons";
import { Alert, Button, Form, Input } from "antd";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { AuthShell } from "./auth-shell";
import { registerSchema } from "@/lib/validations";

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const [form] = Form.useForm<RegisterValues>();
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (values: RegisterValues) => {
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      form.setFields(parsed.error.issues.map((issue) => ({ name: issue.path[0] as keyof RegisterValues, errors: [issue.message] })));
      return;
    }

    setServerError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = await response.json();
      if (!response.ok) { setServerError(body.error?.message || "注册失败，请重试"); return; }
      const login = await signIn("credentials", { email: values.email, password: values.password, redirect: false, callbackUrl: "/dashboard" });
      if (login?.error) setServerError("注册成功，但自动登录失败，请返回登录");
      else window.location.href = login?.url || "/dashboard";
    } finally {
      setIsSubmitting(false);
    }
  };

  return <AuthShell eyebrow="开始记录" title="创建你的投递台" description="用一个账号把投递、节点和下一步都放在手边。" footer={<>已经有账号？<Link href="/login" style={{ marginLeft: 4, color: "#1677ff" }}>返回登录 <ArrowRightOutlined /></Link></>}>
    <Form<RegisterValues> form={form} layout="vertical" requiredMark={false} onFinish={onSubmit}>
      <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请输入用户名" }, { min: 2, message: "用户名至少需要 2 个字符" }, { max: 40, message: "用户名不能超过 40 个字符" }]}>
        <Input autoComplete="name" placeholder="你的称呼" />
      </Form.Item>
      <Form.Item label="邮箱" name="email" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效的邮箱地址" }]}>
        <Input type="email" autoComplete="email" placeholder="you@example.com" />
      </Form.Item>
      <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }, { min: 8, message: "密码至少需要 8 个字符" }, { max: 72, message: "密码不能超过 72 个字符" }]}>
        <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
      </Form.Item>
      <Form.Item label="确认密码" name="confirmPassword" dependencies={["password"]} rules={[{ required: true, message: "请再次输入密码" }, ({ getFieldValue }) => ({ validator(_, value) { if (!value || getFieldValue("password") === value) return Promise.resolve(); return Promise.reject(new Error("两次输入的密码不一致")); } })]}>
        <Input.Password autoComplete="new-password" placeholder="再次输入" />
      </Form.Item>
      {serverError && <Alert showIcon type="error" message={serverError} style={{ marginBottom: 24 }} />}
      <Button type="primary" htmlType="submit" block loading={isSubmitting} icon={<UserAddOutlined />}>创建账号</Button>
    </Form>
  </AuthShell>;
}
