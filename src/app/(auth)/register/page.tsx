import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/register-form";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <RegisterForm />;
}
