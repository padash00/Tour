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
      <aside className="lg:w-[244px] lg:shrink-0 lg:h-screen lg:sticky lg:top-0 flex flex-col border-b lg:border-b-0 lg:border-r border-white/[0.06] bg-[#080d15]">
        <div className="h-14 lg:h-[76px] px-6 flex items-center shrink-0">
          <Link href="/admin" aria-label="F16 Control">
            <ControlLogo />
          </Link>
        </div>
        <div className="hidden lg:block px-6 pb-3 text-[10px] font-medium uppercase tracking-[0.28em] text-[#7f93b0]">Управление</div>
        <div className="px-3 pb-3 lg:pb-0 lg:flex-1">
          <AdminNav />
        </div>
        <div className="hidden lg:block mx-3 mb-3 rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-3.5">
          <div className="flex items-center gap-2.5">
            <Avatar src={admin.avatar_url} name={admin.nickname} size={30} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate">{admin.nickname}</div>
              <div className="text-[11px] text-fg-3">Администратор</div>
            </div>
          </div>
          <Link
            href="/"
            className="mt-3 flex h-8 items-center justify-center rounded-[8px] border border-white/[0.12] text-[12px] text-fg-2 hover:border-white/25 hover:text-fg transition-colors"
          >
            ← На сайт
          </Link>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">{children}</div>
      </div>
    </div>
  );
}
