"use client";

import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { useTransition } from "react";
import { acceptApplication, declineApplication } from "@/app/actions/applications";
import type { ActionResult, FormAction } from "@/components/forms";
import { Button, FaceitLevel, PlayerIdentity, RowList } from "@/components/ds";
import { useToast } from "@/components/toast";

export type InboxItem = {
  id: string;
  message: string | null;
  /** дата подачи, уже отформатированная на сервере */
  date: string;
  player: { steam_id: string; nickname: string; avatar_url: string | null; faceit_level: number | null; faceit_elo: number | null };
};

/** Заявки на вступление — капитану: принять или отклонить. Проверки (места, блокировка турниром) — на сервере */
export function ApplicationsInbox({ items, locked }: { items: InboxItem[]; locked: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  const run = (action: FormAction, id: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("applicationId", id);
      const r: ActionResult = await action(null, fd);
      if (r?.error) toast.error(r.error);
      else if (r?.success) toast.success(r.success);
      router.refresh();
    });

  return (
    <RowList>
      {items.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <div className="min-w-0 flex-1 basis-60">
            <PlayerIdentity
              name={a.player.nickname}
              avatar={a.player.avatar_url}
              href={`/players/${a.player.steam_id}`}
              size="md"
              meta={
                <>
                  {a.date}
                  {a.player.faceit_elo ? <span className="num"> · {a.player.faceit_elo} ELO</span> : null}
                </>
              }
              trailing={<FaceitLevel level={a.player.faceit_level} />}
            />
            {a.message && <p className="mt-2 break-words text-[14px] leading-relaxed text-fg-2">«{a.message}»</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" icon={<Check />} disabled={pending || !!locked} onClick={() => run(acceptApplication, a.id)}>
              Принять
            </Button>
            <Button size="sm" variant="secondary" icon={<X />} disabled={pending} onClick={() => run(declineApplication, a.id)}>
              Отклонить
            </Button>
          </div>
        </div>
      ))}
    </RowList>
  );
}
