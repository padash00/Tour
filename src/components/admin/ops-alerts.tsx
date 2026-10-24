import type { Cs2UpdateCheck } from "@/lib/server/ops";
import { AlertRow } from "./control";
import { ReplayRelayButton } from "./replay-relay-button";

/** Что агент сообщает о защите от сбоев (server_host.info) */
export type OpsInfo = {
  reboot_pending?: boolean | null;
  relay?: { running?: boolean; queued?: number; failed?: number; oldest_age_s?: number; last_error?: string | null } | null;
  recovering?: string[];
  cs2_patch?: string | null;
};

type Alert = { key: string; tone: "danger" | "warn" | "accent"; title: string; text: string; replay?: boolean };

function opsAlerts(info: OpsInfo, cs2: Cs2UpdateCheck | null): Alert[] {
  const list: Alert[] = [];
  for (const name of info.recovering ?? []) {
    list.push({ key: `rec-${name}`, tone: "danger", title: `Сервер ${name} остановился — включаю заново`, text: "Серверный ПК сам включает сервер и снова загружает на него матч. Ничего делать не нужно, о результате придёт уведомление." });
  }
  if (cs2 && cs2.up_to_date === false) {
    list.push({
      key: "cs2",
      tone: "danger",
      title: "Вышло обновление CS2",
      text: `Серверы на версии ${cs2.patch}, Steam требует ${cs2.required ?? "новую"}. Игроки с обновлённой игрой не смогут подключиться. Нажмите «Обновить CS2» в разделе «Обслуживание» на странице «Серверы» (между матчами).`,
    });
  }
  if (info.reboot_pending) {
    list.push({
      key: "reboot",
      tone: "warn",
      title: "Windows ждёт перезагрузку",
      text: "Установлены обновления Windows. Перезагрузите серверный ПК до турнира, иначе Windows может перезагрузить его сама посреди матчей.",
    });
  }
  const r = info.relay;
  if (r && r.running === false) {
    list.push({ key: "relay-off", tone: "warn", title: "Защита от обрыва интернета выключена", text: "События матчей идут на сайт напрямую: если пропадёт интернет, счёт и статистика потеряются. Перезапустите программу на серверном ПК." });
  }
  if (r && (r.queued ?? 0) > 0 && (r.oldest_age_s ?? 0) > 30) {
    list.push({
      key: "relay-queue",
      tone: "warn",
      title: `Досылаем события матчей: ${r.queued}`,
      text: `Связь с сайтом прерывалась, серверный ПК досылает накопленные события матчей${r.last_error ? ` (${r.last_error})` : ""}. Счёт обновится сам.`,
    });
  }
  if (r && (r.failed ?? 0) > 0) {
    list.push({
      key: "relay-failed",
      tone: "accent",
      title: `Сайт не принял событий: ${r.failed}`,
      text: "Они отложены на серверном ПК и не мешают остальным. Если сайт отклонил их из-за сбоя, нажмите «Отправить снова»: счёт и статистика допишутся.",
      replay: true,
    });
  }
  return list;
}

export function opsAlertCount(info: OpsInfo, cs2: Cs2UpdateCheck | null) {
  return opsAlerts(info, cs2).length;
}

export function OpsAlerts({ info, cs2 }: { info: OpsInfo; cs2: Cs2UpdateCheck | null }) {
  const list = opsAlerts(info, cs2);
  if (!list.length) return null;
  return (
    <>
      {list.map((a) => (
        <AlertRow key={a.key} tone={a.tone} title={a.title} action={{ href: "/admin/servers", label: "К серверам" }} extra={a.replay ? <ReplayRelayButton /> : undefined}>
          {a.text}
        </AlertRow>
      ))}
    </>
  );
}
