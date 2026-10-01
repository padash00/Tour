import { mapName } from "@/lib/format";
import { CopyField } from "../forms";
import { Countdown } from "../live-refresh";
import { Eyebrow, btnClass } from "@/components/primitives";

function ConnectIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h12M13 6l6 6-6 6" />
    </svg>
  );
}

/** Ссылка подключения Steam — одна на всю страницу */
export function connectHref(address: string, password: string | null) {
  return `steam://connect/${address}${password ? `/${password}` : ""}`;
}

/** Сервер готов: адрес и одна главная кнопка. Технику игрокам не показываем */
export function ServerReady({
  address,
  password,
  readyAt,
  waiting,
  map,
}: {
  address: string;
  password: string | null;
  readyAt: string | null;
  waiting: boolean;
  map?: string | null;
}) {
  return (
    <section className="relative overflow-hidden rounded-[16px] border border-accent/30 bg-[#0b1420]/90 p-7 sm:p-10 lg:p-12">
      {/* холодный свет за адресом */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_300px_at_15%_0%,#8ab8ff1f,transparent_70%)]" aria-hidden />
      <div className="relative">
        <Eyebrow className="flex items-center gap-3 text-accent">
          <span className="relative flex size-2.5">
            <span className="absolute inset-0 rounded-full bg-accent/60 animate-ping" />
            <span className="relative size-2.5 rounded-full bg-accent" />
          </span>
          {waiting ? "Сервер готов — подключайтесь" : "Матч идёт"}
        </Eyebrow>
        <div className="mt-6 num text-[30px] sm:text-[48px] lg:text-[60px] font-semibold tracking-[-0.03em] leading-none break-all text-fg">
          {address}
        </div>
        <div className="mt-10 flex flex-wrap items-end gap-x-12 gap-y-7">
          <a href={connectHref(address, password)} className={btnClass("primary", "lg", "min-w-[230px] lg:min-w-[300px]")}>
            Подключиться
            <ConnectIcon />
          </a>
          {waiting && readyAt && (
            <div>
              <Eyebrow>На подключение</Eyebrow>
              <div className="mt-2 num text-[26px] lg:text-[32px] font-semibold leading-none">
                <Countdown deadline={new Date(new Date(readyAt).getTime() + 15 * 60_000).toISOString()} long />
              </div>
            </div>
          )}
          {map && (
            <div>
              <Eyebrow>Карта</Eyebrow>
              <div className="mt-2 text-[26px] lg:text-[32px] font-semibold leading-none">{mapName(map)}</div>
            </div>
          )}
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-center">
          <CopyField value={`connect ${address}${password ? `; password ${password}` : ""}`} />
          <ol className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-fg-3">
            <li>
              <span className="num text-fg-4">01</span> Нажмите «Подключиться» или вставьте команду в консоль
            </li>
            <li>
              <span className="num text-fg-4">02</span> В разминке напишите <span className="num text-fg-2">.ready</span>
            </li>
            <li>
              <span className="num text-fg-4">03</span> После ножа — <span className="num text-fg-2">.stay</span> /{" "}
              <span className="num text-fg-2">.switch</span>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

/** Сервер готовится: спокойный статус, страница обновится сама */
export function ServerPreparing({ loading }: { loading: boolean }) {
  return (
    <section className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0b1420]/80 p-7 sm:p-10 lg:p-12">
      <Eyebrow className="flex items-center gap-3">
        <span className="relative flex size-2.5">
          <span className="absolute inset-0 rounded-full bg-accent/60 animate-ping" />
          <span className="relative size-2.5 rounded-full bg-accent" />
        </span>
        Сервер
      </Eyebrow>
      <h2 className="mt-5 text-[28px] sm:text-[40px] lg:text-[52px] font-semibold tracking-[-0.015em] leading-tight">Подготавливаем сервер</h2>
      <p className="mt-4 text-fg-2 text-[16px] lg:text-[18px] max-w-xl">
        {loading
          ? "Загружаем карту и проверяем составы. Адрес появится здесь — страница обновится сама."
          : "Сервер скоро будет назначен. Адрес появится здесь — страница обновится сама."}
      </p>
      <ol className="mt-9 grid max-w-xl grid-cols-3 gap-3 text-[12px] uppercase tracking-[0.2em]">
        {["Сервер", "Карта", "Адрес"].map((s, i) => {
          const done = loading ? i === 0 : false;
          const now = loading ? i === 1 : i === 0;
          return (
            <li key={s}>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div className={done ? "h-full w-full bg-accent/70" : now ? "h-full w-1/2 animate-pulse bg-accent" : "h-0"} />
              </div>
              <div className={`mt-2.5 ${now ? "text-fg" : done ? "text-fg-2" : "text-fg-4"}`}>{s}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
