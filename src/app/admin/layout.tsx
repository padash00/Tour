import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ControlLogo } from "@/components/brand";
import { Avatar } from "@/components/ui";
import { AdminNav } from "./admin-nav";

/** F16 Control — операционная оболочка: левая панель и широкая рабочая область */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <div className="lg:flex min-h-screen bg-bg">
      <aside className="lg:w-[232px] lg:shrink-0 lg:h-screen lg:sticky lg:top-0 flex flex-col border-b lg:border-b-0 lg:border-r border-line bg-bg-2">
        <div className="h-14 lg:h-16 px-5 flex items-center shrink-0">
          <Link href="/admin" aria-label="F16 Control">
            <ControlLogo />
          </Link>
        </div>
        <div className="px-3 pb-3 lg:pb-0 lg:flex-1">
          <AdminNav />
        </div>
        <div className="hidden lg:block p-4 border-t border-line">
          <div className="flex items-center gap-2.5">
            <Avatar src={admin.avatar_url} name={admin.nickname} size={28} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate">{admin.nickname}</div>
              <div className="text-[11px] text-fg-3">Администратор</div>
            </div>
          </div>
          <Link href="/" className="mt-3 block text-[12px] text-fg-3 hover:text-fg">
            ← На сайт
          </Link>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </div>
    </div>
  );
}
