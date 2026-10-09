import Link from "next/link";
import type { ReactNode } from "react";
import { applyToTeam } from "@/app/actions/applications";
import { closePost, invitePlayer, savePlayerPost, saveTeamPost } from "@/app/actions/social";
import { formatDate } from "@/lib/format";
import { FINDER_MODES, FINDER_ROLES, roleLabel, type FinderPost } from "@/lib/finder";
import { ActionForm, SubmitButton } from "../forms";
import { Avatar, FaceitLevel, Input, Panel, TeamLogo, Textarea } from "@/components/ds";

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
        <span key={x} className="inline-flex h-7 items-center rounded-chip border border-line-subtle bg-white/[0.03] px-2.5 text-meta text-fg-2">
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

export function PostForm({ kind, post }: { kind: "player" | "team"; post: FinderPost | null }) {
  return (
    <Panel className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-title text-fg">
            {kind === "player" ? (post ? "Ваше объявление" : "Ищу команду") : post ? "Объявление команды" : "Ищем игрока"}
          </div>
          <p className="mt-1 text-meta text-fg-3">
            {post
              ? `Активно до ${formatDate(post.expires_at)}. Сохранение продлевает ещё на 14 дней.`
              : kind === "player"
                ? "Капитаны увидят ваш уровень FACEIT и смогут пригласить в команду."
                : "Игроки увидят команду и смогут откликнуться — вам придёт уведомление."}
          </p>
        </div>
        {post && (
          <ActionForm action={closePost}>
            <input type="hidden" name="postId" value={post.id} />
            <SubmitButton variant="ghost" size="sm" confirm="Снять объявление?">
              Снять
            </SubmitButton>
          </ActionForm>
        )}
      </div>

      <ActionForm action={kind === "player" ? savePlayerPost : saveTeamPost} className="mt-6 space-y-5">
        <FieldBlock label={kind === "player" ? "Роли" : "Нужные роли"}>
          <CheckGroup name="roles" options={FINDER_ROLES.map((r) => ({ key: r.key, label: r.label }))} selected={post?.roles ?? []} />
        </FieldBlock>
        <FieldBlock label="Режим">
          <CheckGroup name="modes" options={FINDER_MODES.map((m) => ({ key: m, label: modeLabel(m) }))} selected={post?.modes ?? ["5v5"]} />
        </FieldBlock>
        <FieldBlock label="Когда играете" hint="Например: будни после 19:00, выходные">
          <Input name="availability" maxLength={80} defaultValue={post?.availability ?? ""} placeholder="Будни после 19:00" />
        </FieldBlock>
        <FieldBlock label="О себе / о команде" hint="До 300 символов">
          <Textarea name="note" rows={3} maxLength={300} defaultValue={post?.note ?? ""} placeholder={kind === "player" ? "Опыт, турниры, на чём играете" : "Цели команды, уровень, расписание тренировок"} />
        </FieldBlock>
        <SubmitButton size="lg" pendingText="Сохраняем…">
          {post ? "Сохранить и продлить" : "Опубликовать"}
        </SubmitButton>
      </ActionForm>
    </Panel>
  );
}

export function PlayerPostCard({ post, canInvite, own }: { post: FinderPost; canInvite: boolean; own: boolean }) {
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
      <Chips items={[...post.roles.map(roleLabel), ...post.modes.map(modeLabel)]} />
      {post.availability && <div className="text-meta text-fg-2">🕒 {post.availability}</div>}
      {post.note && <p className="break-words text-[14px] leading-relaxed text-fg-2">{post.note}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4">
        <span className="text-meta text-fg-3">Обновлено {formatDate(post.updated_at)}</span>
        {own ? (
          <span className="text-meta text-accent">Ваше объявление</span>
        ) : canInvite ? (
          <ActionForm action={invitePlayer}>
            <input type="hidden" name="postId" value={post.id} />
            <SubmitButton size="sm" pendingText="Отправляем…">
              Пригласить в команду
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </article>
  );
}

export function TeamPostCard({ post, canRespond, own }: { post: FinderPost; canRespond: boolean; own: boolean }) {
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
            {team.member_count != null ? ` · в составе ${team.member_count}` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-meta text-fg-3">
        Капитан
        <Link href={`/players/${post.player.steam_id}`} className="inline-flex items-center gap-1.5 text-fg-2 hover:text-fg">
          {post.player.nickname}
        </Link>
        <FaceitLevel level={post.player.faceit_level} />
      </div>
      <Chips items={[...post.roles.map(roleLabel), ...post.modes.map(modeLabel)]} />
      {post.availability && <div className="text-meta text-fg-2">🕒 {post.availability}</div>}
      {post.note && <p className="break-words text-[14px] leading-relaxed text-fg-2">{post.note}</p>}
      <div className="mt-auto border-t border-line-subtle pt-4">
        {own ? (
          <span className="text-meta text-accent">Ваша команда</span>
        ) : canRespond ? (
          <ActionForm action={applyToTeam} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="teamId" value={team.id} />
            <Input name="message" maxLength={200} placeholder="Пара слов капитану (необязательно)" className="h-10 flex-1" aria-label="Сообщение капитану" />
            <SubmitButton size="sm" className="h-10" pendingText="Отправляем…">
              Подать заявку
            </SubmitButton>
          </ActionForm>
        ) : (
          <span className="text-meta text-fg-3">Обновлено {formatDate(post.updated_at)}</span>
        )}
      </div>
    </article>
  );
}
