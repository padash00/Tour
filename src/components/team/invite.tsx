"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { regenerateInvite } from "@/app/actions/team";
import { Button, ConfirmDialog, Dialog, Field, Input } from "@/components/ds";
import { useToast } from "@/components/toast";
import { useT } from "@/lib/i18n/client";

/** «Пригласить игрока» — окно со ссылкой. Новая ссылка отключает предыдущую */
export function InviteButton({ url, freeSlots, size = "md", variant = "primary", label }: { url: string; freeSlots: number; size?: "sm" | "md" | "lg"; variant?: "primary" | "secondary"; label?: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("Ссылка скопирована"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("Не удалось скопировать — выделите ссылку вручную"));
    }
  };

  return (
    <>
      <Button size={size} variant={variant} icon={<UserPlus />} onClick={() => setOpen(true)}>
        {label ?? t("Пригласить игрока")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("Пригласить игрока")}
        description={freeSlots > 0 ? t("Любой, у кого есть ссылка, сможет вступить в команду, пока есть места. Свободно: {n}.", { n: freeSlots }) : t("Свободных мест нет — сначала освободите место в составе.")}
        footer={
          <>
            <Button variant="ghost" icon={<RefreshCw />} onClick={() => setConfirm(true)}>
              {t("Создать новую ссылку")}
            </Button>
            <Button icon={copied ? <Check /> : <Copy />} onClick={copy} data-autofocus>
              {copied ? t("Скопировано") : t("Скопировать ссылку")}
            </Button>
          </>
        }
      >
        <Field label={t("Ссылка-приглашение")} hint={t("Игрок войдёт через Steam и подтвердит вступление.")}>
          {(p) => <Input {...p} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="num text-meta" />}
        </Field>
        <div className="mt-5 flex flex-col gap-1.5 text-meta">
          <Link href="/find" className="font-medium text-accent hover:text-accent-strong">
            {t("Игроки ищут команду — смотреть объявления →")}
          </Link>
          <Link href="/find?tab=teams" className="text-fg-3 hover:text-fg">
            {t("Разместить объявление «ищем игрока»")}
          </Link>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        title={t("Создать новую ссылку?")}
        description={t("Предыдущая ссылка перестанет работать — игроки, которым вы её отправили, не смогут по ней вступить.")}
        confirmLabel={t("Создать новую ссылку")}
        loading={pending}
        onConfirm={() =>
          start(async () => {
            const r = await regenerateInvite();
            setConfirm(false);
            if (r?.error) toast.error(r.error);
            else toast.success(t("Новая ссылка создана — старая больше не работает"));
            router.refresh();
          })
        }
      />
    </>
  );
}
