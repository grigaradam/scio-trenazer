import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminWithdrawals, type WithdrawalRow } from "@/components/admin/AdminWithdrawals";
import { adminConfigured, isAdmin } from "@/lib/server/admin-auth";
import { loadAdminStats } from "@/lib/server/admin-stats";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Admin" };

export default async function DashboardPage() {
  if (!adminConfigured()) {
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-center">
        <div className="max-w-sm">
          <div className="text-4xl">🔐</div>
          <h1 className="mt-2 font-display text-2xl font-extrabold">Admin není nastavený</h1>
          <p className="mt-2 text-muted">
            Ve Vercelu doplň proměnné <code>ADMIN_USERNAME</code> a <code>ADMIN_PASSWORD</code> a nasaď znovu.
          </p>
        </div>
      </main>
    );
  }
  if (!(await isAdmin())) return <AdminLogin />;
  const [stats, { data: withdrawals }] = await Promise.all([
    loadAdminStats(),
    // without migration 0018 the table is missing – the section just stays hidden
    createAdminClient().from("withdrawals").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <>
      <AdminWithdrawals rows={(withdrawals ?? []) as WithdrawalRow[]} />
      <AdminDashboard stats={stats} />
    </>
  );
}
