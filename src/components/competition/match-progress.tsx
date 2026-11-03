import type { MatchStatus } from "@/lib/types";
import { Steps, type StepState } from "@/components/ds";
import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/core";

const STEPS = [
  { key: "schedule", label: tr("Расписание") },
  { key: "veto", label: tr("Вето") },
  { key: "server", label: tr("Сервер") },
  { key: "live", label: "Live" },
  { key: "done", label: tr("Итог") },
] as const;

function stepIndex(status: MatchStatus) {
  switch (status) {
    case "pending":
    case "upcoming":
      return 0;
    case "veto":
      return 1;
    case "ready":
      return 2;
    case "live":
      return 3;
    case "finished":
    case "cancelled":
      return 4;
  }
}

/** Путь Match Room: один и тот же экран меняется по состояниям, а не отправляет пользователя по разным страницам. */
export async function MatchProgress({ status, singleMap }: { status: MatchStatus; singleMap?: boolean }) {
  const t = await getT();
  if (status === "cancelled") return null;
  const raw = stepIndex(status);
  const steps = singleMap ? STEPS.filter((s) => s.key !== "veto") : [...STEPS];
  const current = singleMap && raw >= 1 ? raw - 1 : raw;

  const state = (i: number): StepState => {
    if (status === "finished") return "done";
    if (i < current) return "done";
    if (i === current) return "current";
    return "todo";
  };

  return <Steps direction="horizontal" steps={steps.map((s, i) => ({ title: t(s.label), state: state(i) }))} />;
}
