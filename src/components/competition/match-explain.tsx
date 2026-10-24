import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { formatDateTime, mapName } from "@/lib/format";
import type { MatchFull } from "@/lib/matches";
import { Timer, cn } from "@/components/ds";

/**
 * «Что происходит» — одна плашка под табло: состояние матча обычными словами по данным матча.
 * Тон: идёт / ваш ход — красный, готов / окончен — зелёный, остальное — нейтральный.
 */
export function MatchExplain({
  m,
  turnTeam,
  myTurn,
  participant,
  next,
  winsToMap,
  serverNow,
}: {
  m: MatchFull;
  /** чей ход в вето */
  turnTeam: string | null;
  myTurn: boolean;
  /** смотрит участник матча или администратор — ему виден адрес сервера */
  participant: boolean;
  /** куда проходит победитель: «Полуфинал», «Финал» */
  next: string | null;
  /** сколько раундов нужно, чтобы выиграть карту */
  winsToMap: number;
  serverNow: number;
}) {
  const t1 = m.team1?.name ?? "Команда 1";
  const t2 = m.team2?.name ?? "Команда 2";
  const seriesWins = Math.ceil(m.best_of / 2);
  const advance = next
    ? `Победитель пройдёт дальше — ${next}.`
    : m.bracket === "third_place"
      ? "Победитель займёт третье место."
      : isFinal(m)
        ? "Победитель станет победителем турнира."
        : "";
  let tone: "live" | "ok" | "neutral" = "neutral";
  let title: ReactNode;
  let text: ReactNode = null;

  switch (m.status) {
    case "pending":
      title = "Ждём соперников";
      text = "Команды определятся по итогам предыдущих матчей. Страница обновится сама.";
      break;
    case "upcoming":
      title = m.scheduled_at ? `Матч назначен на ${formatDateTime(m.scheduled_at)}` : "Матч назначен";
      text = m.tournament.map_pool.length <= 1 ? "Карта уже известна. Когда сервер будет готов, здесь появится кнопка подключения." : "Сначала капитаны выберут карту. Им придёт уведомление.";
      break;
    case "veto":
      tone = myTurn ? "live" : "neutral";
      title = myTurn ? "Ваш ход — выберите карту ниже" : turnTeam ? `Идёт выбор карт. Сейчас ход: ${turnTeam}` : "Идёт выбор карт";
      text = (
        <>
          Капитаны по очереди убирают карты, оставшаяся будет сыграна.
          {m.veto_deadline && (
            <>
              {" "}На ход осталось <Timer deadline={m.veto_deadline} serverNow={serverNow} urgentAt={10} className="font-bold text-fg" />. Если время выйдет, карту выберут случайно.
            </>
          )}
        </>
      );
      break;
    case "ready":
      tone = m.server_address ? "ok" : "neutral";
      title = m.server_address ? (participant ? "Сервер готов — нажмите «Подключиться»" : "Сервер готов, игроки подключаются") : "Готовим сервер";
      text = m.server_address
        ? participant
          ? "Скопируйте адрес справа и вставьте в консоль CS2 (клавиша ~). В разминке напишите .ready."
          : "Адрес сервера видят только игроки этих двух команд."
        : "Загружаем карту. Адрес появится здесь автоматически — страницу обновлять не нужно.";
      break;
    case "live": {
      tone = "live";
      const map = m.maps.find((x) => x.status === "live");
      if (map) {
        const lead = map.team1_score === map.team2_score ? null : map.team1_score > map.team2_score ? t1 : t2;
        title = lead
          ? `Идёт игра на ${mapName(map.map_name)}. Ведёт ${lead} — ${Math.max(map.team1_score, map.team2_score)} : ${Math.min(map.team1_score, map.team2_score)}`
          : `Идёт игра на ${mapName(map.map_name)}. Счёт равный — ${map.team1_score} : ${map.team2_score}`;
      } else {
        title = "Идёт игра";
      }
      // овертайм: оба набрали на раунд меньше нужного — играется MR3 (6 раундов), побеждает взявший 4
      const overtime = !!map && m.tournament.overtime && Math.min(map.team1_score, map.team2_score) >= winsToMap - 1;
      text = [
        overtime
          ? "Идёт овертайм: по 6 раундов, побеждает команда, которая первой выиграет 4. При равенстве — ещё один овертайм."
          : `Карту выигрывает тот, кто первым возьмёт ${winsToMap} раундов.`,
        m.best_of > 1 ? `Серия до ${seriesWins} побед, по картам ${m.team1_score} : ${m.team2_score}.` : "",
        advance,
        participant ? "Если игра вылетела — подключитесь заново, раунд сохранится." : "",
      ]
        .filter(Boolean)
        .join(" ");
      break;
    }
    case "finished": {
      tone = "ok";
      const winner = m.winner_id === m.team1_id ? t1 : m.winner_id === m.team2_id ? t2 : null;
      const ws = Math.max(m.team1_score, m.team2_score);
      const ls = Math.min(m.team1_score, m.team2_score);
      const oneMap = m.maps.filter((x) => x.status === "finished");
      const mapScore = m.best_of === 1 && oneMap.length === 1 ? ` (${mapName(oneMap[0].map_name)} ${Math.max(oneMap[0].team1_score, oneMap[0].team2_score)} : ${Math.min(oneMap[0].team1_score, oneMap[0].team2_score)})` : "";
      title = winner ? `Матч окончен: победили ${winner} — ${ws} : ${ls}${mapScore}` : "Матч окончен";
      text = m.under_review
        ? "Результат проверяет администратор."
        : winner && next
          ? `${winner} проходят дальше — ${next}.`
          : winner && m.bracket === "third_place"
            ? `${winner} занимают третье место.`
            : winner && isFinal(m)
              ? `${winner} — победитель турнира.`
              : "Результат учтён в турнире.";
      break;
    }
    default:
      tone = "neutral";
      title = "Матч отменён";
      text = "Этот матч не будет сыгран.";
  }

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3.5 rounded-surface px-4 py-4 sm:px-5",
        tone === "live" ? "bg-danger-dim text-fg" : tone === "ok" ? "bg-accent-dim text-fg" : "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--color-line-subtle)]",
      )}
    >
      <Info className={cn("mt-0.5 size-6 shrink-0", tone === "live" ? "text-live" : tone === "ok" ? "text-accent" : "text-fg-3")} aria-hidden />
      <div className="min-w-0">
        <p className="text-[17px] font-bold leading-snug">{title}</p>
        {text && <p className="mt-1 text-[15.5px] leading-relaxed text-fg-2">{text}</p>}
      </div>
    </div>
  );
}

/** Финал турнира: матч плей-офф, из которого победитель никуда не переходит (матч за 3-е место — отдельно) */
function isFinal(m: MatchFull) {
  return !m.winner_to_match && (m.bracket === "upper" || m.bracket === "grand_final");
}
