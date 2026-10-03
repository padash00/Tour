"use client";

import { useState, useTransition } from "react";
import { disbandTeam, leaveTeam } from "@/app/actions/team";
import { Button, ConfirmDialog } from "@/components/ds";
import { useToast } from "@/components/toast";

/** Опасная зона: распустить (капитан) или покинуть (игрок). Только с подтверждением */
export function DangerZone({ isCaptain, teamName }: { isCaptain: boolean; teamName: string }) {
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
      <p className="mt-1.5 max-w-read text-[14px] leading-relaxed text-fg-2">
        {isCaptain
          ? "Роспуск исключит всех игроков, команда исчезнет из списков. Отменить нельзя. Чтобы уйти самому, сначала передайте капитанство в разделе «Состав»."
          : "Вы покинете команду и не сможете играть за неё в турнирах. Вернуться можно будет только по новому приглашению."}
      </p>
      <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>
        {isCaptain ? "Распустить команду" : "Покинуть команду"}
      </Button>
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
