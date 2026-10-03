// Иконки лобби (stroke 1.8) — без "use client": их вызывают и серверные страницы

const I = ({ d, className = "size-5" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
export const Icon = {
  globe: (c?: string) => <I className={c} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.4 3.7-5.4 3.7-9S14.5 5.4 12 3m0 18c-2.5-2.4-3.7-5.4-3.7-9S9.5 5.4 12 3M3.5 9h17M3.5 15h17" />,
  lock: (c?: string) => <I className={c} d="M7 10V7a5 5 0 0 1 10 0v3M5.5 10h13v10.5h-13zM12 14v3" />,
  eyeOff: (c?: string) => <I className={c} d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.6 3.8M6.3 6.3A13.3 13.3 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7a9.5 9.5 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  map: (c?: string) => <I className={c} d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v13m6-10.5v13" />,
  swords: (c?: string) => <I className={c} d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M9.5 6.5 14 2h3v3l-4.5 4.5M5 14l4 4M3 19l2 2" />,
  user: (c?: string) => <I className={c} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" />,
  users: (c?: string) => <I className={c} d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0m1-10a3 3 0 1 0 0-6m3 16a6 6 0 0 0-4-5.6" />,
  play: (c?: string) => <I className={c} d="M7 4.5v15l12-7.5-12-7.5Z" />,
  signal: (c?: string) => <I className={c} d="M5 20v-4M10 20v-8M15 20V8M20 20V4" />,
  tv: (c?: string) => <I className={c} d="M3 7h18v12H3zM8 3l4 4 4-4" />,
  layers: (c?: string) => <I className={c} d="M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" />,
  rotate: (c?: string) => <I className={c} d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />,
  mic: (c?: string) => <I className={c} d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3" />,
  filter: (c?: string) => <I className={c} d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5Z" />,
  knife: (c?: string) => <I className={c} d="M3 21 14 10m0 0 6.5-6.5a2 2 0 0 1 0 3L17 10l-3 0Zm-3.5 3.5 3 3" />,
  shuffle: (c?: string) => <I className={c} d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />,
  shield: (c?: string) => <I className={c} d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" />,
  skull: (c?: string) => <I className={c} d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.5V20h10v-3.5c1.8-1.1 3-2.9 3-5.5a8 8 0 0 0-8-8ZM9 12h.01M15 12h.01M10 20v-2m4 2v-2" />,
  money: (c?: string) => <I className={c} d="M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 9v.01M18 15v.01" />,
  pause: (c?: string) => <I className={c} d="M8 5v14M16 5v14" />,
  clock: (c?: string) => <I className={c} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2" />,
  flask: (c?: string) => <I className={c} d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9" />,
  radar: (c?: string) => <I className={c} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9 6-6M12 16a4 4 0 1 0 0-8" />,
  bot: (c?: string) => <I className={c} d="M5 9h14v10H5zM12 9V5m-3 9h.01M15 14h.01M9 19v2m6-2v2M12 5a1 1 0 1 0 0-.01" />,
  gear: (c?: string) => <I className={c} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.5c-.8.3-1.5.8-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1c.7.5 1.4 1 2.2 1.3l.4 2.5h4l.4-2.5c.8-.3 1.5-.8 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z" />,
  link: (c?: string) => <I className={c} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  back: (c?: string) => <I className={c} d="M19 12H5m6-6-6 6 6 6" />,
  exit: (c?: string) => <I className={c} d="M15 4h4v16h-4M10 8l-4 4 4 4m-4-4h11" />,
  plus: (c?: string) => <I className={c} d="M12 5v14M5 12h14" />,
  crown: (c?: string) => <I className={c} d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />,
  scale: (c?: string) => <I className={c} d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0L6 7Zm12 0-3 7a3 3 0 0 0 6 0l-3-7Z" />,
  swap: (c?: string) => <I className={c} d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7" />,
  broom: (c?: string) => <I className={c} d="M19 3 12 10m-4 1 5 5-3 5H3l1-6 4-4Zm-1 7 2 2" />,
  edit: (c?: string) => <I className={c} d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4" />,
  send: (c?: string) => <I className={c} d="M4 12 20 4l-6 16-3-7-7-1Z" />,
  more: (c?: string) => <I className={c} d="M5 12h.01M12 12h.01M19 12h.01" />,
  check: (c?: string) => <I className={c} d="m5 12 4.5 4.5L19 7" />,
  x: (c?: string) => <I className={c} d="M6 6l12 12M18 6 6 18" />,
  copy: (c?: string) => <I className={c} d="M9 9h11v11H9zM5 15H4V4h11v1" />,
};
