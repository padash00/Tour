import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import { BrandLogo } from "@/components/brand";
import { IconSteam, Notice } from "@/components/ui";
import { Eyebrow } from "@/components/public/home";

export const metadata: Metadata = { title: "Вход" };

const errors: Record<string, string> = {
  steam: "Steam не подтвердил вход. Попробуйте ещё раз.",
  db: "Не удалось сохранить профиль. Попробуйте позже.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const error = typeof sp.error === "string" ? errors[sp.error] : null;
  if (await getCurrentPlayer()) redirect(next);

  return (
    <div className="relative flex min-h-[calc(100vh-96px)] items-center justify-center overflow-hidden px-5 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_480px_at_50%_0%,#16253d80,transparent_70%)]" />
      <div className="relative w-full max-w-[440px] text-center">
        <span className="inline-flex justify-center">
          <BrandLogo height={64} />
        </span>
        <Eyebrow className="mt-10">Аккаунт игрока</Eyebrow>
        <h1 className="mt-4 text-[36px] lg:text-[44px] font-semibold tracking-[-0.015em]">Войти через Steam</h1>
        <p className="mt-4 text-[16px] lg:text-[17px] text-fg-2 leading-relaxed">Steam используется как единый аккаунт игрока F16 Arena.</p>

        {error && (
          <div className="mt-6 text-left">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}

        <a href={`/api/auth/steam?next=${encodeURIComponent(next)}`} className="mt-10 inline-flex h-[60px] w-full items-center justify-center gap-3 rounded-[8px] bg-accent text-[17px] font-semibold text-[#07101b] transition-colors hover:bg-accent-strong">
          <IconSteam className="size-5" />
          Войти через Steam
        </a>

        <p className="mt-9 text-[14px] text-fg-3 leading-relaxed">
          Регистрация команды · доступ к матчам · статистика
          <br />
          Пароль остаётся у Valve — мы получаем только SteamID, ник и аватар.
        </p>
      </div>
    </div>
  );
}
