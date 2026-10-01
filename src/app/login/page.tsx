import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import { F16Logo } from "@/components/brand";
import { IconSteam, Notice, buttonClass } from "@/components/ui";

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
    <div className="flex min-h-[calc(100vh-68px)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-[400px] text-center">
        <span className="inline-flex justify-center">
          <F16Logo size={44} />
        </span>
        <h1 className="mt-8 text-[32px] font-bold tracking-[-0.035em]">Войти через Steam</h1>
        <p className="mt-3 text-fg-2 leading-relaxed">Steam используется как единый аккаунт игрока F16 Arena.</p>

        {error && (
          <div className="mt-6 text-left">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}

        <a href={`/api/auth/steam?next=${encodeURIComponent(next)}`} className={buttonClass("primary", "lg", "mt-8 w-full")}>
          <IconSteam className="size-5" />
          Войти через Steam
        </a>

        <p className="mt-8 text-[13px] text-fg-3 leading-relaxed">
          Регистрация команды · доступ к матчам · статистика
          <br />
          Пароль остаётся у Valve — мы получаем только SteamID, ник и аватар.
        </p>
      </div>
    </div>
  );
}
