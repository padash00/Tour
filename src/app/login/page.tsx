import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import { Container, IconSteam, Notice, buttonClass } from "@/components/ui";

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
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 atmos" />
      <div className="absolute inset-0 grid-lines" />
      <Container className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center py-16">
        <div className="card w-full max-w-[440px] p-8 sm:p-10">
          <div className="label">F16 Arena</div>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">Вход на платформу</h1>
          <p className="mt-3 text-sm text-fg-2 leading-relaxed">
            Мы используем только Steam. Ваш пароль остаётся у Valve — мы получаем лишь SteamID, ник и аватар.
          </p>

          {error && (
            <div className="mt-6">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}

          <a
            href={`/api/auth/steam?next=${encodeURIComponent(next)}`}
            className={buttonClass("primary", "lg", "mt-8 w-full")}
          >
            <IconSteam className="size-5" />
            Войти через Steam
          </a>

          <ul className="mt-8 space-y-3 border-t border-line pt-6 text-sm text-fg-2">
            {[
              "Быстрая авторизация без паролей",
              "Создание команды и приглашение игроков",
              "Регистрация на турниры и check-in",
              "Статистика матчей в вашем профиле",
            ].map((b) => (
              <li key={b} className="flex items-center gap-3">
                <span className="size-1.5 rounded-full bg-accent" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </div>
  );
}
