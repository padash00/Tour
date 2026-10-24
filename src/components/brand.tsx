/* eslint-disable @next/next/no-img-element -- логотип: SVG-файлы бренда как есть */

/**
 * Логотип F16 Arena — векторные файлы в public/brand, собраны из оригинала (чёрный фон, лаймовый градиент F16,
 * белое ARENA). Углы знака — ровные 45°, полей в viewBox нет: отступы задаёт место, где стоит логотип.
 *   light      — для светлого фона сайта (меню, шапка, подвал, вход): тёмное ARENA
 *   horizontal — знак + ARENA в строку на тёмном фоне (картинки для соцсетей, трансляция)
 *   stacked    — как оригинал: ARENA под знаком (заставки, большие экраны)
 *   white      — монохромный на тёмном (трансляции/OBS) · black — на светлом (печать, дипломы)
 * PNG (public/brand/png) — только где SVG нельзя: иконки приложения, картинки соцсетей.
 */

const LOGO = {
  /** для светлого фона сайта: тёмное ARENA, знак темнее — читается на белом */
  light: "/brand/f16-arena-light.svg",
  horizontal: "/brand/f16-arena-horizontal.svg",
  white: "/brand/f16-arena-white.svg",
  black: "/brand/f16-arena-black.svg",
} as const;
const LOGO_RATIO = 1414 / 326;

const SYMBOL = {
  light: "/brand/f16-symbol-light.svg",
  color: "/brand/f16-symbol.svg",
  white: "/brand/f16-symbol-white.svg",
  black: "/brand/f16-symbol-black.svg",
} as const;
const SYMBOL_RATIO = 743 / 326;

export function BrandLogo({
  height = 40,
  variant = "light",
  className,
}: {
  height?: number;
  variant?: keyof typeof LOGO;
  /** оставлено для совместимости вызовов */
  priority?: boolean;
  className?: string;
}) {
  return (
    <img
      src={LOGO[variant]}
      alt="F16 Arena"
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      className={className}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
}

export function BrandSymbol({
  height = 24,
  variant = "light",
  className,
}: {
  height?: number;
  variant?: keyof typeof SYMBOL;
  className?: string;
}) {
  return (
    <img
      src={SYMBOL[variant]}
      alt=""
      aria-hidden
      width={Math.round(height * SYMBOL_RATIO)}
      height={height}
      className={className}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
}

/** F16 Control: знак + подпись раздела */
export function ControlLogo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandSymbol height={26} />
      <span className="flex flex-col leading-none">
        <span className="text-[13px] font-extrabold tracking-[0.02em] text-fg">F16</span>
        <span className="mt-1 text-[9px] font-semibold tracking-[0.32em] text-accent">CONTROL</span>
      </span>
    </span>
  );
}
