"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { refixSeason, setSeasonPrizePaid } from "@/app/actions/admin-mix";
import { useT } from "@/lib/i18n/client";
import { useToast } from "../toast";

const LINK = "text-micro font-medium text-accent underline-offset-2 hover:underline disabled:opacity-50";

/** Админ: отметить, что приз за место выплачен, или снять отметку */
export function PrizePaidButton({ season, place, paid }: { season: string; place: number; paid: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const click = () =>
    start(async () => {
      const r = await setSeasonPrizePaid(season, place, !paid);
      if (r.error) return toast.error(t(r.error));
      router.refresh();
    });
  return (
    <button type="button" onClick={click} disabled={pending} className={LINK}>
      {paid ? t("Снять отметку") : t("Отметить выплату")}
    </button>
  );
}

/** Админ: пересчитать зафиксированные итоги сезона по текущей истории игр */
export function RefixSeasonButton({ season }: { season: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const click = () => {
    if (!window.confirm(t("Пересчитать итоги сезона по текущей истории игр? Призёры могут измениться."))) return;
    start(async () => {
      const r = await refixSeason(season);
      if (r.error) return toast.error(t(r.error));
      toast.success(t("Итоги сезона пересчитаны"));
      router.refresh();
    });
  };
  return (
    <button type="button" onClick={click} disabled={pending} className={LINK}>
      {t("Пересчитать итоги")}
    </button>
  );
}
