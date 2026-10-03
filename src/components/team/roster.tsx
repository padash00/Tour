"use client";

import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpToLine, Crown, Ellipsis, Plus, UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { kickMember, setMemberRole, transferCaptain } from "@/app/actions/team";
import type { ActionResult, FormAction } from "@/components/forms";
import { ConfirmDialog, FaceitLevel, IconButton, Menu, MenuItem, MenuSeparator, PlayerIdentity, RowList, SubsectionTitle, cn } from "@/components/ds";
import { useToast } from "@/components/toast";

export type RosterMember = {
  id: string;
  role: "captain" | "player" | "substitute";
  player: { steam_id: string; nickname: string; avatar_url: string | null; faceit_level: number | null; faceit_elo: number | null; is_banned: boolean };
};

const ROLE = { captain: "Капитан", player: "Основа", substitute: "Запас" } as const;

/**
 * Состав: основа и запас отдельно, пустые места видны. Капитану — меню «⋯» у игрока:
 * перевести в запас / основу, сделать капитаном; «Исключить» — отдельно, с подтверждением.
 */
export function Roster({ members, isCaptain, locked, maxMain, maxSubs }: { members: RosterMember[]; isCaptain: boolean; locked: string | null; maxMain: number; maxSubs: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<{ kind: "kick" | "captain"; m: RosterMember } | null>(null);

  const run = (action: FormAction, fields: Record<string, string>, after?: () => void) =>
    start(async () => {
      const fd = new FormData();
      for (const [k, val] of Object.entries(fields)) fd.set(k, val);
      const r: ActionResult = await action(null, fd);
      if (r?.error) toast.error(r.error);
      else if (r?.success) toast.success(r.success);
      after?.();
      router.refresh();
    });

  const mains = members.filter((m) => m.role !== "substitute").sort((a, b) => Number(b.role === "captain") - Number(a.role === "captain"));
  const subs = members.filter((m) => m.role === "substitute");
  const canManage = isCaptain && !locked;

  const row = (m: RosterMember) => (
    <div key={m.id} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <PlayerIdentity
          name={m.player.nickname}
          avatar={m.player.avatar_url}
          href={`/players/${m.player.steam_id}`}
          captain={m.role === "captain"}
          size="md"
          meta={
            <>
              {m.player.is_banned ? <span className="text-danger">Заблокирован</span> : ROLE[m.role]}
              {m.player.faceit_elo ? <span className="num"> · {m.player.faceit_elo} ELO</span> : null}
            </>
          }
        />
      </div>
      <FaceitLevel level={m.player.faceit_level} />
      {canManage && m.role !== "captain" ? (
        <Menu
          label={`Действия: ${m.player.nickname}`}
          trigger={
            <IconButton label={`Действия: ${m.player.nickname}`} size="sm" disabled={pending}>
              <Ellipsis />
            </IconButton>
          }
        >
          {m.role === "substitute" ? (
            <MenuItem icon={<ArrowUpToLine />} onSelect={() => run(setMemberRole, { memberId: m.id, role: "player" })}>
              Перевести в основу
            </MenuItem>
          ) : (
            <MenuItem icon={<ArrowDownToLine />} onSelect={() => run(setMemberRole, { memberId: m.id, role: "substitute" })}>
              Перевести в запас
            </MenuItem>
          )}
          <MenuItem icon={<Crown />} onSelect={() => setConfirm({ kind: "captain", m })}>
            Сделать капитаном
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<UserMinus />} danger onSelect={() => setConfirm({ kind: "kick", m })}>
            Исключить из команды
          </MenuItem>
        </Menu>
      ) : (
        isCaptain && <span className="size-8" aria-hidden />
      )}
    </div>
  );

  const empty = (n: number, label: string) =>
    Array.from({ length: Math.max(0, n) }, (_, i) => (
      <div key={`e${i}`} className="flex min-h-16 items-center gap-3 px-4 text-fg-3">
        <span className="grid size-10 place-items-center rounded-full border border-dashed border-line">
          <Plus className="size-4" />
        </span>
        <span className="text-[14px]">{label}</span>
      </div>
    ));

  return (
    <div className="space-y-8">
      <div>
        <SubsectionTitle action={<span className={cn("num text-meta", mains.length >= maxMain ? "text-ok" : "text-warn")}>{mains.length}/{maxMain}</span>}>Основной состав</SubsectionTitle>
        <RowList>
          {mains.map(row)}
          {empty(maxMain - mains.length, "Свободное место в основе")}
        </RowList>
      </div>
      <div>
        <SubsectionTitle action={<span className="num text-meta text-fg-3">{subs.length}/{maxSubs}</span>}>Запасные</SubsectionTitle>
        <RowList>
          {subs.map(row)}
          {empty(maxSubs - subs.length, "Свободное место в запасе")}
        </RowList>
      </div>

      <ConfirmDialog
        open={confirm?.kind === "captain"}
        onCancel={() => setConfirm(null)}
        title={`Передать капитанство игроку ${confirm?.m.player.nickname ?? ""}?`}
        description="Вы станете обычным игроком: управлять составом и подавать заявки будет новый капитан."
        confirmLabel="Передать капитанство"
        loading={pending}
        onConfirm={() => confirm && run(transferCaptain, { memberId: confirm.m.id }, () => setConfirm(null))}
      />
      <ConfirmDialog
        open={confirm?.kind === "kick"}
        onCancel={() => setConfirm(null)}
        title={`Исключить ${confirm?.m.player.nickname ?? ""} из команды?`}
        description="Игрок получит уведомление. Вернуться он сможет только по ссылке-приглашению."
        confirmLabel="Исключить"
        danger
        loading={pending}
        onConfirm={() => confirm && run(kickMember, { memberId: confirm.m.id }, () => setConfirm(null))}
      />
    </div>
  );
}
