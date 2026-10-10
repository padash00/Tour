import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { safeNext } from "@/lib/redirect";
import { BrandLogo } from "@/components/brand";
import { Callout } from "@/components/ds";
import { SteamLoginButton } from "@/components/auth/steam-login";

export const metadata: Metadata = { title: "Вход", robots: { index: false } };

const ERRORS: Record<string, { title: string; text: string }> = {
  steam: { title: "Steam не подтвердил вход", text: "Возможно, вход отменили или Steam не ответил. Попробуйте ещё раз." },
  db: { title: "Не удалось сохранить профиль", text: "Вход в Steam прошёл, но сайт не смог записать профиль. Попробуйте через минуту." },
};

/** Куда вернём после входа — чтобы игрок не терял контекст (приглашение, регистрация, лобби, матч) */
function returnHint(next: string): string | null {
  if (next.startsWith("/join/")) return "После входа вернём вас к приглашению в команду.";
  if (/^\/tournaments\/[^/]+\/register/.test(next)) return "После входа вернём вас к регистрации на турнир.";
  if (/^\/tournaments\/[^/]+\/checkin/.test(next)) return "После входа вернём вас к check-in.";
  if (next.startsWith("/lobby/")) return "После входа вернём вас в лобби.";
  if (next.startsWith("/matches/")) return "После входа вернём вас к матчу.";
  if (next.startsWith("/team")) return "После входа откроем вашу команду.";
  return null;
}

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? ERRORS.steam) : null;
  if (await getCurrentPlayer()) redirect(next);
  const hint = returnHint(next);

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="rounded-feature border border-line-subtle bg-surface p-6 sm:p-8">
          <BrandLogo height={40} />
          <h1 className="mt-8 text-page text-fg">Войти в F16 Arena</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-2">Используйте Steam-аккаунт для турниров, лобби и матчей.</p>

          {error && (
            <Callout tone="danger" title={error.title} className="mt-6">
              {error.text}
            </Callout>
          )}
          {hint && !error && (
            <Callout className="mt-6" title={hint} />
          )}

          <div className="mt-8">
            <SteamLoginButton href={`/api/auth/steam?next=${encodeURIComponent(next)}`} />
          </div>
          <p className="mt-4 text-meta leading-relaxed text-fg-3">F16 не получает ваш пароль Steam — только SteamID, ник и аватар.</p>
        </div>
      </div>
    </div>
  );
}
