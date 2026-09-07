import { getCurrentUser } from "@/lib/auth";
import { getDashboardForUser, listApplicationsForUser } from "@/lib/application-service";
import { listCategoriesForUser } from "@/lib/company-service";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [stats, list, categories] = await Promise.all([
    getDashboardForUser(user.id),
    listApplicationsForUser(user.id, { page: 1, pageSize: 10, sort: "statusPriority", direction: "asc" }),
    listCategoriesForUser(user.id),
  ]);
  return <DashboardClient user={{ username: user.username, email: user.email }} initialStats={stats} initialList={list} initialCategories={categories} />;
}
