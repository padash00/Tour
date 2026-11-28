"use client";

import { Segmented } from "@/components/ds";
import { useT } from "@/lib/i18n/client";
import { cupTeams, type CupFormat } from "@/lib/cup-core";

/*
 * Первый вопрос при создании лобби — сколько игроков. До 10 — обычная комната на две команды;
 * 20, 30 или 40 — несколько команд по пять и матчи между ними (сетка или круговая).
 */
export function SizePicker({
  players,
  format,
  onPlayers,
  onFormat,
  small,
}: {
  players: number;
  format: CupFormat;
  onPlayers: (n: number) => void;
  onFormat: (f: CupFormat) => void;
  /** подпись для обычного размера: «до 10» в лобби, «10» в игре на банк */
  small: string;
}) {
  const t = useT();
  const teams = cupTeams(players);
  const matches = format === "round" ? (teams * (teams - 1)) / 2 : teams - 1;
  return (
    <div>
      <div className="text-[14px] font-semibold text-fg">{t("Сколько игроков")}</div>
      <Segmented<number>
        className="mt-2"
        label={t("Сколько игроков")}
        value={players}
        onChange={onPlayers}
        options={[
          { value: 0, label: small },
          { value: 20, label: "20" },
          { value: 30, label: "30" },
          { value: 40, label: "40" },
        ]}
      />
      {teams > 0 ? (
        <>
          <div className="mt-4 text-[14px] font-semibold text-fg">{t("Как играют команды")}</div>
          <Segmented<CupFormat>
            className="mt-2"
            label={t("Как играют команды")}
            value={format}
            onChange={onFormat}
            options={[
              { value: "bracket", label: t("Сетка на вылет") },
              { value: "round", label: t("Круговая") },
            ]}
          />
          <p className="mt-2 text-meta text-fg-3">
            {t("{teams} команд по 5 игроков, матчей: {matches}. Игроков по командам разбирают капитаны, каждый матч идёт в своей комнате на своём сервере.", { teams, matches })}
            {format === "round" ? ` ${t("Каждая команда играет с каждой, все матчи — BO1. Победа — 3 очка. Места — по таблице: очки, затем разница раундов. Первое и второе место играют финал BO3.")}` : ""}
          </p>
        </>
      ) : (
        <p className="mt-2 text-meta text-fg-3">{t("Две команды, один матч.")}</p>
      )}
    </div>
  );
}
