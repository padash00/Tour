"use client";

import { useRouter } from "next/navigation";
import { GraduationCap, X } from "lucide-react";
import { useState, useTransition } from "react";
import { cancelInvite, removeCoach } from "@/app/actions/invites";
import type { ActionResult } from "@/components/forms";
import { Button, ConfirmDialog, FaceitLevel, PlayerIdentity, RowList, SubsectionTitle } from "@/components/ds";
import { useToast } from "@/components/toast";
import { useT } from "@/lib/i18n/client";
import { InviteByNick } from "./invite-by-nick";

type Who = { steam_id: string; nickname: string; avatar_url: string | null; faceit_level: number | null };
export type PendingInvite = { id: string; role: "player" | "coach"; date: string; player: Who };

function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else if (r?.success) toast.success(r.success);
      router.refresh();
    });
  return { pending, run };
}

/** Слот тренера: один на команду, необязательный. Капитан приглашает по нику или убирает тренера */
export function CoachSlot({ coach, invited, isCaptain }: { coach: Who | null; invited: PendingInvite | null; isCaptain: boolean }) {
  const t = useT();
  const { pending, run } = useRun();
  const [confirm, setConfirm] = useState(false);
  const fd = (k: string, v: string) => {
    const f = new FormData();
    f.set(k, v);
    return f;
  };
  return (
    <div>
      <SubsectionTitle action={<span className="num text-meta text-fg-3">{coach ? 1 : 0}/1</span>}>{t("Тренер")}</SubsectionTitle>
      <RowList>
        <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2.5">
          {coach ? (
            <>
              <div className="min-w-0 flex-1">
                <PlayerIdentity name={coach.nickname} avatar={coach.avatar_url} href={`/players/${coach.steam_id}`} size="md" meta={t("Тренер · не играет")} trailing={<FaceitLevel level={coach.faceit_level} />} />
              </div>
              {isCaptain && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm(true)}>
                  {t("Убрать")}
                </Button>
              )}
            </>
          ) : invited ? (
            <>
              <div className="min-w-0 flex-1">
                <PlayerIdentity name={invited.player.nickname} avatar={invited.player.avatar_url} size="md" meta={t("Приглашён тренером {date} · ждём ответа", { date: invited.date })} />
              </div>
              {isCaptain && (
                <Button size="sm" variant="ghost" icon={<X />} disabled={pending} onClick={() => run(() => cancelInvite(null, fd("inviteId", invited.id)))}>
                  {t("Отменить")}
                </Button>
              )}
            </>
          ) : (
            <>
              <span className="grid size-10 place-items-center rounded-full border border-dashed border-line-strong text-fg-3 [&>svg]:size-4">
                <GraduationCap aria-hidden />
              </span>
              <div className="min-w-0 flex-1 text-meta text-fg-3">{t("Тренер не назначен — необязательно. В официальных турнирах может требоваться.")}</div>
              {isCaptain && <InviteByNick role="coach" size="sm" />}
            </>
          )}
        </div>
      </RowList>
      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        title={t("Убрать тренера?")}
        description={t("Тренер получит уведомление. Пригласить его снова можно в любой момент.")}
        confirmLabel={t("Убрать")}
        danger
        loading={pending}
        onConfirm={() => {
          setConfirm(false);
          run(() => removeCoach());
        }}
      />
    </div>
  );
}

/** Отправленные приглашения игрокам: ждут ответа, капитан может отменить */
export function PendingInvites({ items, isCaptain }: { items: PendingInvite[]; isCaptain: boolean }) {
  const t = useT();
  const { pending, run } = useRun();
  if (!items.length) return null;
  return (
    <div>
      <SubsectionTitle action={<span className="num text-meta text-fg-3">{items.length}</span>}>{t("Приглашены — ждём ответа")}</SubsectionTitle>
      <RowList>
        {items.map((i) => (
          <div key={i.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">
              <PlayerIdentity name={i.player.nickname} avatar={i.player.avatar_url} href={`/players/${i.player.steam_id}`} size="sm" meta={t("Приглашён {date}", { date: i.date })} />
            </div>
            {isCaptain && (
              <Button
                size="sm"
                variant="ghost"
                icon={<X />}
                disabled={pending}
                onClick={() =>
                  run(() => {
                    const f = new FormData();
                    f.set("inviteId", i.id);
                    return cancelInvite(null, f);
                  })
                }
              >
                {t("Отменить")}
              </Button>
            )}
          </div>
        ))}
      </RowList>
    </div>
  );
}
