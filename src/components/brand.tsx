/* eslint-disable @next/next/no-img-element -- логотип: SVG-файлы бренда как есть */

/**
 * Логотип F16 Arena — векторные мастер-файлы из F16_Arena_Clean_Vector_Assets (public/brand).
 * Файлы не перерисовываются и не обрезаются: в viewBox намеренно заложены поля.
 *   horizontal — основной цветной (шапка, подвал, вход)
 *   white      — монохромный на тёмном (трансляции/OBS)
 *   black      — на светлом (печать, документы)
 * PNG-рендеры (public/brand/png) — только где SVG нельзя: иконки приложения, печать.
 */

const LOGO = {
  horizontal: "/brand/f16-arena-horizontal.svg",
  white: "/brand/f16-arena-white.svg",
  black: "/brand/f16-arena-black.svg",
} as const;
const LOGO_RATIO = 2228 / 842; // viewBox -90 -80 2228 842

const SYMBOL = {
  color: "/brand/f16-symbol.svg",
  white: "/brand/f16-symbol-white.svg",
  black: "/brand/f16-symbol-black.svg",
} as const;
const SYMBOL_RATIO = 2046 / 1700; // viewBox 3 171 2046 1700

export function BrandLogo({
  height = 40,
  variant = "horizontal",
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
  variant = "color",
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
        <span className="text-[13px] font-bold tracking-[0.04em] text-fg">F16</span>
        <span className="mt-1 text-[9px] font-medium tracking-[0.32em] text-fg-3">CONTROL</span>
      </span>
    </span>
  );
}
