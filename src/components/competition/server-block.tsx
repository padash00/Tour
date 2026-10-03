import { ArrowRight } from "lucide-react";
import { mapName } from "@/lib/format";
import { CopyField } from "../forms";
import { CriticalSurface, FeatureSurface, Timer, buttonClass } from "@/components/ds";

/** Ссылка подключения Steam — одна на всю страницу */
export function connectHref(address: string, password: string | null) {
  return `steam://connect/${address}${password ? `/${password}` : ""}`;
}

/** Сервер готов: одно главное действие, рядом только данные, нужные игроку. */
export function ServerReady({
  address,
  password,
  readyAt,
  waiting,
  map,
  serverNow,
}: {
  address: string;
  password: string | null;
  readyAt: string | null;
  waiting: boolean;
  map?: string | null;
  serverNow: number;
}) {
  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className={`text-micro font-semibold uppercase tracking-[0.14em] ${waiting ? "text-ok" : "text-live"}`}>
            {waiting ? "Сервер готов" : "Матч идёт"}
          </div>
          <h2 className="mt-2 text-heading text-fg">{waiting ? "Подключайтесь к серверу" : "Сервер матча"}</h2>
          <div className="num mt-3 text-[24px] font-semibold tracking-[-0.02em] text-fg sm:text-[34px]">{address}</div>
        </div>
        {waiting && readyAt && (
          <div className="text-right">
            <div className="text-micro text-fg-3">На подключение</div>
            <Timer
              deadline={new Date(new Date(readyAt).getTime() + 15 * 60_000).toISOString()}
              serverNow={serverNow}
              urgentAt={60}
              className="mt-1 block text-[28px] font-semibold"
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a href={connectHref(address, password)} className={buttonClass("primary", "lg", "min-w-[220px]")}>
          Подключиться
          <ArrowRight className="size-4" aria-hidden />
        </a>
        {map && <span className="text-[14px] text-fg-2">Карта: <strong className="font-medium text-fg">{mapName(map)}</strong></span>}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-center">
        <CopyField value={`connect ${address}${password ? `; password ${password}` : ""}`} />
        <ol className="grid gap-1.5 text-meta text-fg-3">
          <li><span className="num mr-2 text-fg-4">01</span>Откройте сервер кнопкой или вставьте команду в консоль.</li>
          <li><span className="num mr-2 text-fg-4">02</span>В разминке напишите <span className="num text-fg-2">.ready</span>.</li>
          <li><span className="num mr-2 text-fg-4">03</span>После ножевого — <span className="num text-fg-2">.stay</span> / <span className="num text-fg-2">.switch</span>.</li>
        </ol>
      </div>
    </>
  );

  return waiting ? <CriticalSurface tone="ok">{content}</CriticalSurface> : <FeatureSurface>{content}</FeatureSurface>;
}

/** Сервер готовится: страница остаётся в Match Room и сама переходит в следующий state. */
export function ServerPreparing({ loading }: { loading: boolean }) {
  return (
    <FeatureSurface>
      <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">Сервер</div>
      <h2 className="mt-2 text-heading text-fg">Подготавливаем сервер</h2>
      <p className="mt-2 max-w-read text-[14px] text-fg-2">
        {loading
          ? "Загружаем карту и проверяем составы. Адрес появится здесь автоматически."
          : "Сервер будет назначен автоматически. Оставаться на этой странице достаточно."}
      </p>
      <div className="mt-6 grid max-w-xl grid-cols-3 gap-3">
        {["Сервер", "Карта", "Адрес"].map((label, i) => {
          const done = loading ? i === 0 : false;
          const current = loading ? i === 1 : i === 0;
          return (
            <div key={label}>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div className={done ? "h-full w-full bg-accent/70" : current ? "h-full w-1/2 animate-pulse bg-accent" : "h-0"} />
              </div>
              <div className={`mt-2 text-micro ${current ? "text-fg" : done ? "text-fg-2" : "text-fg-4"}`}>{label}</div>
            </div>
          );
        })}
      </div>
    </FeatureSurface>
  );
}
