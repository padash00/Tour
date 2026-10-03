"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { disbandTeam, leaveTeam } from "@/app/actions/team";
import { Button, ConfirmDialog } from "@/components/ds";
import { useToast } from "@/components/toast";

export type DangerBlock = { title: string; text: string; link?: { href: string; label: string } };

/**
 * Опасная зона: распустить (капитан) или покинуть (игрок). Только с подтверждением.
 * blocked — действие сейчас невозможно (состав заблокирован турниром / активная заявка): причина видна сразу,
 * кнопки нет. Проверка на сервере остаётся главной.
 */
export function DangerZone({ isCaptain, teamName, blocked }: { isCaptain: boolean; teamName: string; blocked?: DangerBlock | null }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const act = () =>
    start(async () => {
      // при успехе действие само уводит на /me
      const r = await (isCaptain ? disbandTeam() : leaveTeam());
      if (r?.error) {
        toast.error(r.error);
        setOpen(false);
      }
    });
  return (
    <section className="rounded-surface border border-danger/25 bg-danger-dim/40 p-5 sm:p-6">
      <h2 className="text-title text-fg">Опасная зона</h2>
      {blocked ? (
        <div className="mt-3 flex gap-3 rounded-control border border-line bg-black/20 px-4 py-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <div className="text-[14px] leading-relaxed">
            <div className="font-medium text-fg">{blocked.title}</div>
            <div className="mt-0.5 text-fg-2">{blocked.text}</div>
            {blocked.link && (
              <Link href={blocked.link.href} className="mt-2 inline-block font-medium text-accent hover:text-accent-strong">
                {blocked.link.label} →
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1.5 max-w-read text-[14px] leading-relaxed text-fg-2">
            {isCaptain
              ? "Роспуск исключит всех игроков, команда исчезнет из списков. Отменить нельзя. Чтобы уйти самому, сначала передайте капитанство в разделе «Состав»."
              : "Вы покинете команду и не сможете играть за неё в турнирах. Вернуться можно будет только по новому приглашению."}
          </p>
          <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>
            {isCaptain ? "Распустить команду" : "Покинуть команду"}
          </Button>
        </>
      )}
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        title={isCaptain ? `Распустить ${teamName}?` : `Покинуть ${teamName}?`}
        description={isCaptain ? "Все игроки будут исключены. Это действие нельзя отменить." : "Капитан получит уведомление."}
        confirmLabel={isCaptain ? "Распустить команду" : "Покинуть команду"}
        danger
        loading={pending}
        onConfirm={act}
      />
    </section>
  );
}
