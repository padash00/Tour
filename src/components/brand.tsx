import { useId } from "react";

/**
 * Фирменный знак F16 Arena (по брендбуку): стреловидная «F» из двух штрихов,
 * сталь-белый сверху → ледяной голубой к низу. Работает от 16 px.
 */
export const SYMBOL_OUTER = "M21 0H64L57 11H27L8 48H0Z";
export const SYMBOL_INNER = "M33 17H56L49.5 27H37.5L24 46H17Z";

/** «F16» — нарисованные глифы, наклон вперёд; 6 — угловатая */
export const WORD_F16 =
  "M0 0H30L27 9H9V16H24L21.5 24H9V40H0Z" +
  "M36 0H45V40H36V10L31 12V4Z" +
  "M53 0H80V9H62V16H76L82 22V34L76 40H59L53 34ZM62 24V31H73V24Z";

export function F16Symbol({ className = "size-7", mono }: { className?: string; mono?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden>
      {!mono && (
        <defs>
          <linearGradient id={`g${id}`} x1="60" y1="0" x2="4" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#F4F7FB" />
            <stop offset="0.55" stopColor="#C9DCF7" />
            <stop offset="1" stopColor="#8AB8FF" />
          </linearGradient>
        </defs>
      )}
      <g fill={mono ? "currentColor" : `url(#g${id})`}>
        <path d={SYMBOL_OUTER} />
        <path d={SYMBOL_INNER} />
      </g>
    </svg>
  );
}

export function F16Word({ className = "h-4" }: { className?: string }) {
  return (
    <svg viewBox="-6 0 92 40" className={className} aria-hidden>
      <path d={WORD_F16} fill="currentColor" fillRule="evenodd" transform="skewX(-12) translate(8 0)" />
    </svg>
  );
}

/**
 * Горизонтальный логотип: знак слева, справа F16 и разреженное ARENA (или CONTROL для админки).
 * size — высота знака в px.
 */
export function F16Logo({ size = 30, suffix = "ARENA" }: { size?: number; suffix?: string }) {
  return (
    <span className="inline-flex items-center text-fg" style={{ gap: size * 0.3 }}>
      <span className="shrink-0 block" style={{ width: (size * 4) / 3, height: size }}>
        <F16Symbol className="block size-full" />
      </span>
      <span className="flex flex-col items-start justify-center leading-none" style={{ gap: size * 0.14 }}>
        <span className="block" style={{ height: size * 0.5, width: size * 0.5 * 2.3 }}>
          <F16Word className="block size-full" />
        </span>
        <span
          className="block font-medium text-fg-2"
          style={{ fontSize: Math.max(8, size * 0.27), letterSpacing: "0.42em", marginRight: "-0.42em" }}
        >
          {suffix}
        </span>
      </span>
    </span>
  );
}
