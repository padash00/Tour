import { mapName } from "@/lib/format";
import { CopyField } from "../forms";
import { Countdown } from "../live-refresh";
import { Eyebrow } from "@/components/primitives";

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
    <section className="rounded-[12px] border border-accent/30 bg-[#0b1420]/80 p-7 sm:p-10 lg:p-12">
      <Eyebrow className="flex items-center gap-3 text-accent">
        <span className="size-2 rounded-full bg-accent animate-pulse" />
        Сервер готов
      </Eyebrow>
      <div className="mt-6 num text-[32px] sm:text-[48px] lg:text-[60px] font-semibold tracking-[-0.03em] leading-none break-all">{address}</div>
      <div className="mt-10 flex flex-wrap items-center gap-x-12 gap-y-6">
        <a
          href={`steam://connect/${address}${password ? `/${password}` : ""}`}
          className="inline-flex h-[52px] lg:h-[60px] min-w-[230px] lg:min-w-[300px] items-center justify-center gap-3 rounded-[8px] bg-accent px-8 text-[15px] lg:text-[17px] font-semibold text-[#07101b] transition-colors duration-150 hover:bg-accent-strong"
        >
          Подключиться
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
      <div className="mt-10 max-w-md">
        <CopyField value={`connect ${address}${password ? `; password ${password}` : ""}`} />
      </div>
      <p className="mt-4 text-[14px] text-fg-3">
        В разминке напишите <span className="num text-fg-2">.ready</span>. После ножевого раунда —{" "}
        <span className="num text-fg-2">.stay</span> или <span className="num text-fg-2">.switch</span>.
      </p>
    </section>
  );
}

/** Сервер готовится: спокойный статус, страница обновится сама */
export function ServerPreparing({ loading }: { loading: boolean }) {
  return (
    <section className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-7 sm:p-10 lg:p-12">
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
      <div className="mt-8 h-1 w-full max-w-lg overflow-hidden rounded-full bg-white/[0.06]">
        <div className={loading ? "h-full w-2/3 bg-accent/70 rounded-full" : "h-full w-1/4 bg-accent/40 rounded-full"} />
      </div>
    </section>
  );
}
