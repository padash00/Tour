import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDeleteProfile, adminSaveProfile } from "@/app/actions/player-profile";
import { ADMIN_CARD, AdminHeader } from "@/components/admin/control";
import { DeleteProfileButton, ProfileForm } from "@/components/profile/profile-form";
import { requireAdmin } from "@/lib/auth";
import { formatShortDateTime } from "@/lib/format";
import { isProfileComplete, missingProfileFields } from "@/lib/profile";
import { auditPersonalView, getOrganizationSuggestions, getProfile, profileLock } from "@/lib/profiles";
import { safeNext } from "@/lib/redirect";
import { db } from "@/lib/supabase";

export const metadata: Metadata = { title: "Анкета игрока — F16 Control" };

/** Админ смотрит и правит анкету любого игрока (в том числе зафиксированную официальным турниром) */
export default async function AdminPlayerProfilePage(props: PageProps<"/admin/players/[id]/profile">) {
  const { id } = await props.params;
  const admin = await requireAdmin(`/admin/players/${id}/profile`); // права проверяются в каждой странице, не только в layout
  const sp = await props.searchParams;
  const back = safeNext(typeof sp.back === "string" ? sp.back : null, "/admin/players");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: player } = await db().from("players").select("id, nickname, steam_id").eq("id", id).maybeSingle();
  if (!player) notFound();
  const [profile, suggestions, lock] = await Promise.all([getProfile(id), getOrganizationSuggestions(), profileLock(id)]);
  await auditPersonalView(admin.id, "profile.view", { type: "player", id });
  const missing = missingProfileFields(profile);

  return (
    <div className="space-y-6">
      <AdminHeader
        back={{ href: back.startsWith("/admin") ? back : "/admin/players", label: "Назад" }}
        eyebrow="Анкета игрока"
        title={player.nickname}
        description={
          <span className="num">
            SteamID {player.steam_id}
            {profile?.updated_at ? ` · изменена ${formatShortDateTime(profile.updated_at)}` : ""}
            {profile?.consent_at ? ` · согласие ${formatShortDateTime(profile.consent_at)}${profile.consent_version === "paper" ? " (на бумаге)" : ` (версия ${profile.consent_version})`}` : " · согласия нет"}
          </span>
        }
      />
      <div className={`${ADMIN_CARD} max-w-3xl p-6`}>
        {!isProfileComplete(profile) && <p className="mb-5 text-[13px] text-warn">Не заполнено: {missing.join(", ")}.</p>}
        <ProfileForm
          key={profile?.updated_at ?? "new"}
          action={adminSaveProfile}
          profile={profile}
          suggestions={suggestions}
          admin
          playerId={id}
          locked={lock ? `Игрок заявлен на официальный турнир «${lock.name}» — сам он анкету не меняет. Ваши правки сразу попадут в проверки и выгрузки турнира.` : null}
        />
      </div>
      {profile && (profile.last_name || profile.birth_date || profile.phone) && (
        <div className="max-w-3xl rounded-[12px] border border-danger/25 bg-danger/[0.03] p-5">
          <div className="text-[14px] font-semibold text-danger/90">Удалить персональные данные игрока</div>
          <p className="mt-1 mb-3 text-[13px] text-fg-3">
            ФИО, дата рождения, телефон, место учёбы или работы и согласие будут удалены. Аккаунт, команда и статистика останутся.
            {lock ? ` Игрок заявлен на «${lock.name}» — без анкеты заявка не пройдёт проверку.` : ""}
          </p>
          <DeleteProfileButton
            action={adminDeleteProfile}
            fields={{ playerId: id }}
            label="Удалить анкету"
            title={`Удалить анкету ${player.nickname}?`}
            description="Персональные данные игрока будут удалены без возможности восстановления. Действие записывается в журнал."
          />
        </div>
      )}
    </div>
  );
}
