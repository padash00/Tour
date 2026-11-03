import Link from "next/link";
import type { ReactNode } from "react";
import { applyToTeam } from "@/app/actions/applications";
import { closePost, invitePlayer, savePlayerPost, saveTeamPost } from "@/app/actions/social";
import { formatDate } from "@/lib/format";
import { FINDER_MODES, FINDER_ROLES, roleLabel, type FinderPost } from "@/lib/finder";
import { ActionForm, SubmitButton } from "../forms";
import { Avatar, FaceitLevel, Input, Panel, TeamLogo, Textarea } from "@/components/ds";
import { getT } from "@/lib/i18n/server";

const modeLabel = (m: string) => (m === "2v2" ? "2×2" : "5×5");

function FieldBlock({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-meta font-medium text-fg-2">{label}</div>
      {children}
      {hint && <p className="text-meta text-fg-3">{hint}</p>}
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <span key={x} className="inline-flex h-7 items-center rounded-chip border border-line-subtle bg-ink/[0.03] px-2.5 text-meta text-fg-2">
          {x}
        </span>
      ))}
    </div>
  );
}

function CheckGroup({ name, options, selected }: { name: string; options: { key: string; label: string }[]; selected: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o.key}
          className="relative inline-flex min-h-10 cursor-pointer items-center rounded-control border border-line px-3.5 text-[14px] text-fg-2 transition-colors has-[:checked]:border-accent/60 has-[:checked]:bg-accent-dim has-[:checked]:text-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/50"
        >
          <input type="checkbox" name={name} value={o.key} defaultChecked={selected.includes(o.key)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export async function PostForm({ kind, post }: { kind: "player" | "team"; post: FinderPost | null }) {
  const t = await getT();
  return (
    <Panel className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-title text-fg">
            {kind === "player" ? (post ? t("Ваше объявление") : t("Ищу команду")) : post ? t("Объявление команды") : t("Ищем игрока")}
          </div>
          <p className="mt-1 text-meta text-fg-3">
            {post
              ? t("Активно до {date}. Сохранение продлевает ещё на 14 дней.", { date: formatDate(post.expires_at, t.lang) })
              : kind === "player"
                ? t("Капитаны увидят ваш уровень FACEIT и смогут пригласить в команду.")
                : t("Игроки увидят команду и смогут откликнуться — вам придёт уведомление.")}
          </p>
        </div>
        {post && (
          <ActionForm action={closePost}>
            <input type="hidden" name="postId" value={post.id} />
            <SubmitButton variant="ghost" size="sm" confirm={t("Снять объявление?")}>
              {t("Снять")}
            </SubmitButton>
          </ActionForm>
        )}
      </div>

      <ActionForm action={kind === "player" ? savePlayerPost : saveTeamPost} className="mt-6 space-y-5">
        <FieldBlock label={kind === "player" ? t("Роли") : t("Нужные роли")}>
          <CheckGroup name="roles" options={FINDER_ROLES.map((r) => ({ key: r.key, label: t(r.label) }))} selected={post?.roles ?? []} />
        </FieldBlock>
        <FieldBlock label={t("Режим")}>
          <CheckGroup name="modes" options={FINDER_MODES.map((m) => ({ key: m, label: modeLabel(m) }))} selected={post?.modes ?? ["5v5"]} />
        </FieldBlock>
        <FieldBlock label={t("Когда играете")} hint={t("Например: будни после 19:00, выходные")}>
          <Input name="availability" maxLength={80} defaultValue={post?.availability ?? ""} placeholder={t("Будни после 19:00")} />
        </FieldBlock>
        <FieldBlock label={t("О себе / о команде")} hint={t("До 300 символов")}>
          <Textarea name="note" rows={3} maxLength={300} defaultValue={post?.note ?? ""} placeholder={kind === "player" ? t("Опыт, турниры, на чём играете") : t("Цели команды, уровень, расписание тренировок")} />
        </FieldBlock>
        <SubmitButton size="lg" pendingText={t("Сохраняем…")}>
          {post ? t("Сохранить и продлить") : t("Опубликовать")}
        </SubmitButton>
      </ActionForm>
    </Panel>
  );
}

export async function PlayerPostCard({ post, canInvite, own }: { post: FinderPost; canInvite: boolean; own: boolean }) {
  const t = await getT();
  return (
    <article className="flex flex-col gap-4 rounded-surface border border-line-subtle bg-surface p-5 lg:p-6">
      <div className="flex items-center gap-4">
        <Avatar src={post.player.avatar_url} name={post.player.nickname} size="lg" />
        <div className="min-w-0 flex-1">
          <Link href={`/players/${post.player.steam_id}`} className="block truncate text-[17px] font-semibold text-fg hover:text-accent">
            {post.player.nickname}
          </Link>
          <div className="mt-1 flex items-center gap-2 text-meta text-fg-3">
            <FaceitLevel level={post.player.faceit_level} />
            <span className="num">{post.player.faceit_elo ?? "—"} ELO</span>
            {post.player.country && <span>· {post.player.country}</span>}
          </div>
        </div>
      </div>
      <Chips items={[...post.roles.map((r) => t(roleLabel(r))), ...post.modes.map(modeLabel)]} />
      {post.availability && <div className="text-meta text-fg-2">🕒 {post.availability}</div>}
      {post.note && <p className="break-words text-[14px] leading-relaxed text-fg-2">{post.note}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4">
        <span className="text-meta text-fg-3">{t("Обновлено {date}", { date: formatDate(post.updated_at, t.lang) })}</span>
        {own ? (
          <span className="text-meta text-accent">{t("Ваше объявление")}</span>
        ) : canInvite ? (
          <ActionForm action={invitePlayer}>
            <input type="hidden" name="postId" value={post.id} />
            <SubmitButton size="sm" pendingText={t("Отправляем…")}>
              {t("Пригласить в команду")}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </article>
  );
}

export async function TeamPostCard({ post, canRespond, own }: { post: FinderPost; canRespond: boolean; own: boolean }) {
  const t = await getT();
  const team = post.team!;
  return (
    <article className="flex flex-col gap-4 rounded-surface border border-line-subtle bg-surface p-5 lg:p-6">
      <div className="flex items-center gap-4">
        <TeamLogo src={team.logo_url} tag={team.tag} size="lg" />
        <div className="min-w-0 flex-1">
          <Link href={`/teams/${team.tag}`} className="block truncate text-[17px] font-semibold text-fg hover:text-accent">
            {team.name}
          </Link>
          <div className="mt-1 text-meta text-fg-3">
            {team.tag}
            {team.region ? ` · ${team.region}` : ""}
            {team.member_count != null ? ` · ${t("в составе {n}", { n: team.member_count })}` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-meta text-fg-3">
        {t("Капитан")}
        <Link href={`/players/${post.player.steam_id}`} className="inline-flex items-center gap-1.5 text-fg-2 hover:text-fg">
          {post.player.nickname}
        </Link>
        <FaceitLevel level={post.player.faceit_level} />
      </div>
      <Chips items={[...post.roles.map((r) => t(roleLabel(r))), ...post.modes.map(modeLabel)]} />
      {post.availability && <div className="text-meta text-fg-2">🕒 {post.availability}</div>}
      {post.note && <p className="break-words text-[14px] leading-relaxed text-fg-2">{post.note}</p>}
      <div className="mt-auto border-t border-line-subtle pt-4">
        {own ? (
          <span className="text-meta text-accent">{t("Ваша команда")}</span>
        ) : canRespond ? (
          <ActionForm action={applyToTeam} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="teamId" value={team.id} />
            <Input name="message" maxLength={200} placeholder={t("Пара слов капитану (необязательно)")} className="h-10 flex-1" aria-label={t("Сообщение капитану")} />
            <SubmitButton size="sm" className="h-10" pendingText={t("Отправляем…")}>
              {t("Подать заявку")}
            </SubmitButton>
          </ActionForm>
        ) : (
          <span className="text-meta text-fg-3">{t("Обновлено {date}", { date: formatDate(post.updated_at, t.lang) })}</span>
        )}
      </div>
    </article>
  );
}
