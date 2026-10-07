import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { deleteOwnProfile, saveProfile } from "@/app/actions/player-profile";
import { requirePlayer } from "@/lib/auth";
import { PRIVACY_VERSION, isProfileComplete, missingProfileFields } from "@/lib/profile";
import { getOrganizationSuggestions, getProfile, isProfileRequired, profileLock } from "@/lib/profiles";
import { safeNext } from "@/lib/redirect";
import { Callout, Container, Eyebrow, PageTitle, Panel } from "@/components/ds";
import { DeleteProfileButton, ProfileForm } from "@/components/profile/profile-form";

export const metadata: Metadata = { title: "Анкета игрока", robots: { index: false } };

/** Анкета игрока: видит и меняет только сам игрок (и администраторы в F16 Control) */
export default async function ProfilePage(props: PageProps<"/me/profile">) {
  const player = await requirePlayer("/me/profile");
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  const welcome = sp.welcome === "1";
  const [profile, suggestions, lock, required] = await Promise.all([getProfile(player.id), getOrganizationSuggestions(), profileLock(player.id), isProfileRequired()]);
  const complete = isProfileComplete(profile);
  const missing = profile ? missingProfileFields(profile) : [];
  const hasData = !!profile && !!(profile.last_name || profile.birth_date || profile.phone);

  return (
    <Container width="read" className="pb-16 pt-6 sm:pt-8">
      <Link href="/me" className="-ml-1 inline-flex min-h-11 items-center gap-1 text-meta text-fg-3 hover:text-fg sm:min-h-0">
        <ArrowLeft className="size-4" aria-hidden />
        Моя игра
      </Link>
      <header className="mt-3">
        <Eyebrow tone={complete ? "ok" : "accent"}>{complete ? "Анкета заполнена" : "Анкета игрока"}</Eyebrow>
        <PageTitle className="mt-1">{welcome ? `${player.nickname}, добро пожаловать!` : "Анкета игрока"}</PageTitle>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
          {welcome
            ? "Заполните анкету — она нужна для участия в турнирах: организаторы проверяют возраст, место учёбы или работы участников."
            : "Данные для заявок на турниры. Их видите только вы и администраторы F16 — в публичном профиле их нет."}
          {required ? " Без анкеты нельзя создать команду, вступить в неё и подать заявку на турнир." : ""}
        </p>
      </header>

      <div className="mt-6 space-y-5">
        {!complete && hasData && missing.length > 0 && !lock && (
          <Callout tone="warn" title="Анкета заполнена не полностью">
            Не хватает: {missing.join(", ")}.
          </Callout>
        )}
        {welcome && (
          <Callout title="Можно заполнить позже">
            Смотреть турниры, матчи и играть в лобби можно и без анкеты.{" "}
            <Link href={next || "/me"} className="text-accent hover:underline">
              Пропустить
            </Link>
          </Callout>
        )}
        <Panel className="p-5 sm:p-7">
          <ProfileForm
            key={profile?.updated_at ?? "new"}
            action={saveProfile}
            profile={profile}
            suggestions={suggestions}
            next={next || undefined}
            locked={lock ? `Вы заявлены на официальный турнир «${lock.name}» — анкета зафиксирована до его окончания. Если в данных ошибка, напишите администратору: исправить может только он.` : null}
            consentCurrent={!!profile?.consent_at && profile.consent_version === PRIVACY_VERSION}
          />
        </Panel>
        {hasData && !lock && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-line-subtle px-4 py-3 sm:px-5">
            <span className="text-meta text-fg-3">
              Хотите, чтобы мы удалили ваши данные? <Link href="/privacy" className="text-accent hover:underline">Политика обработки данных</Link>
            </span>
            <DeleteProfileButton action={deleteOwnProfile} />
          </div>
        )}
      </div>
    </Container>
  );
}
