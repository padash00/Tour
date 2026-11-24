import { Flame, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/components/ds";
import { mapLabel } from "@/lib/maps";
import type { T } from "@/lib/i18n/core";
import { RADAR_AXES, ROLES, type MapCell, type RadarKey, type RoleKey } from "@/lib/twenty-core";

/*
 * Мелкие части раздела «Микс»: роль, коронная карта, стрелка формы, рейтинг-плашка, паутинка.
 * Без хуков — рендерятся и на сервере, и внутри клиентской комнаты лобби; переводчик передаётся снаружи.
 */

/** Цвет рейтинга: 1.00 — средний игрок */
export function ratingTone(rating: number) {
  return rating >= 1.15 ? "bg-ok/15 text-ok" : rating >= 1 ? "bg-accent-dim text-fg" : "bg-ink/[0.05] text-fg-3";
}

export function RatingPill({ value, className }: { value: number; className?: string }) {
  return <span className={cn("num inline-flex min-w-[60px] justify-center rounded-chip px-2.5 py-1 text-[15px] font-extrabold", ratingTone(value), className)}>{value.toFixed(2)}</span>;
}

/** Роль игрока — короткий ярлык с пояснением при наведении */
export function RoleChip({ role, t, className }: { role: RoleKey | null; t: T; className?: string }) {
  if (!role) return null;
  return (
    <span title={t(ROLES[role].hint)} className={cn("inline-flex shrink-0 items-center rounded-chip bg-ink/[0.06] px-1.5 py-0.5 text-micro font-semibold text-fg-2", className)}>
      {t(ROLES[role].label)}
    </span>
  );
}

/** Коронная карта: название и рейтинг на ней */
export function BestMapChip({ cell, t, className }: { cell: Pick<MapCell, "map" | "rating"> | null; t: T; className?: string }) {
  if (!cell) return null;
  return (
    <span title={t("Коронная карта: лучший рейтинг игрока — на {map}", { map: mapLabel(cell.map) })} className={cn("inline-flex shrink-0 items-center gap-1 rounded-chip bg-gold/[0.14] px-1.5 py-0.5 text-micro font-semibold text-gold", className)}>
      {mapLabel(cell.map)} <span className="num">{cell.rating.toFixed(2)}</span>
    </span>
  );
}

/** Форма: последний игровой день против прежних. Ноль и «не с чем сравнить» не показываем */
export function Trend({ value, t, className }: { value: number | null; t: T; className?: string }) {
  if (!value) return null;
  const up = value > 0;
  const Arrow = up ? TrendingUp : TrendingDown;
  return (
    <span title={up ? t("В последний игровой день играл лучше обычного") : t("В последний игровой день играл хуже обычного")} className={cn("num inline-flex shrink-0 items-center gap-0.5 text-micro font-semibold", up ? "text-ok" : "text-danger", className)}>
      <Arrow className="size-3.5" aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(2)}
    </span>
  );
}

/** Серия побед — от трёх матчей подряд */
export function Streak({ n, t }: { n: number; t: T }) {
  if (n < 3) return null;
  return (
    <span title={t("Побед подряд: {n}", { n })} className="num inline-flex shrink-0 items-center gap-0.5 rounded-chip bg-warn/15 px-1.5 py-0.5 text-micro font-semibold text-warn">
      <Flame className="size-3.5" aria-hidden />
      {n}
    </span>
  );
}

/** Цвет ячейки «игрок × карта» по рейтингу; бледнее — если игр на карте мало */
export function heatTone(rating: number) {
  return rating >= 1.3 ? "bg-ok/30 text-fg" : rating >= 1.1 ? "bg-ok/15 text-fg" : rating >= 0.95 ? "bg-ink/[0.05] text-fg-2" : rating >= 0.8 ? "bg-warn/15 text-fg-2" : "bg-danger/15 text-fg-2";
}

const RADAR_COLORS = ["text-accent", "text-warn"];

/**
 * Паутинка стиля: шесть осей, значение — место среди игроков (100 — лучший).
 * Один или два игрока; второй накладывается поверх для сравнения.
 */
export function Radar({ series, t, size = 280 }: { series: { name: string; values: Record<RadarKey, number> }[]; t: T; size?: number }) {
  const c = size / 2;
  const r = size / 2 - 46;
  const n = RADAR_AXES.length;
  const at = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };
  const ring = (v: number) => RADAR_AXES.map((_, i) => at(i, v).map((x) => x.toFixed(1)).join(",")).join(" ");
  const label = series.map((s) => `${s.name}: ${RADAR_AXES.map((a) => `${t(a.label)} ${s.values[a.key]}`).join(", ")}`).join(". ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="mx-auto block h-auto w-full" style={{ maxWidth: size }}>
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <polygon key={v} points={ring(v)} fill="none" stroke="var(--color-line-subtle)" strokeWidth={v === 1 ? 1.5 : 1} />
      ))}
      {RADAR_AXES.map((a, i) => {
        const [x, y] = at(i, 1);
        const [lx, ly] = at(i, 1.22);
        return (
          <g key={a.key}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="var(--color-line-subtle)" strokeWidth={1} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-fg-3 text-[11px] font-semibold">
              <title>{t(a.hint)}</title>
              {t(a.label)}
            </text>
          </g>
        );
      })}
      {series.map((s, k) => (
        <g key={k} className={RADAR_COLORS[k % RADAR_COLORS.length]}>
          {/* совсем нулевое значение оставляет точку у центра, иначе фигура схлопывается в линию */}
          <polygon points={RADAR_AXES.map((a, i) => at(i, Math.max(0.06, s.values[a.key] / 100)).map((x) => x.toFixed(1)).join(",")).join(" ")} fill="currentColor" fillOpacity={0.16} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
          {RADAR_AXES.map((a, i) => {
            const [x, y] = at(i, Math.max(0.06, s.values[a.key] / 100));
            return <circle key={a.key} cx={x} cy={y} r={3} fill="currentColor" />;
          })}
        </g>
      ))}
    </svg>
  );
}

/** Подпись серии паутинки: цветная точка и ник */
export function RadarLegend({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-meta font-semibold text-fg">
      {names.map((name, k) => (
        <span key={k} className="inline-flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full bg-current", RADAR_COLORS[k % RADAR_COLORS.length])} />
          {name}
        </span>
      ))}
    </div>
  );
}
