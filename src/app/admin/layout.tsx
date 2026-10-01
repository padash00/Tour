import { requireAdmin } from "@/lib/auth";
import { Container } from "@/components/ui";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <Container className="pt-10">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-8 items-start">
        <aside className="min-w-0 lg:sticky lg:top-24">
          <div className="label mb-3 px-3">Control · {admin.nickname}</div>
          <AdminNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
