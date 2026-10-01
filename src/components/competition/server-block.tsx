import { mapName } from "@/lib/format";
import { CopyField } from "../forms";
import { Countdown } from "../live-refresh";
import { buttonClass } from "../ui";

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
    <section className="rounded-2xl bg-surface border border-accent/25 p-6 sm:p-10">
      <div className="flex items-center gap-2 text-accent text-sm font-medium">
        <span className="size-1.5 rounded-full bg-accent animate-pulse" />
        Сервер готов
      </div>
      <div className="mt-4 num text-[28px] sm:text-[40px] font-semibold tracking-[-0.03em] break-all">{address}</div>
      <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-5">
        <a href={`steam://connect/${address}${password ? `/${password}` : ""}`} className={buttonClass("primary", "lg", "px-8")}>
          Подключиться
        </a>
        {waiting && readyAt && (
          <div>
            <div className="text-[13px] text-fg-3">На подключение</div>
            <div className="num text-xl font-semibold">
              <Countdown deadline={new Date(new Date(readyAt).getTime() + 15 * 60_000).toISOString()} long />
            </div>
          </div>
        )}
        {map && (
          <div>
            <div className="text-[13px] text-fg-3">Карта</div>
            <div className="text-xl font-semibold">{mapName(map)}</div>
          </div>
        )}
      </div>
      <div className="mt-8 max-w-md">
        <CopyField value={`connect ${address}${password ? `; password ${password}` : ""}`} />
      </div>
      <p className="mt-4 text-[13px] text-fg-3">
        В разминке напишите <span className="num text-fg-2">.ready</span>. После ножевого раунда —{" "}
        <span className="num text-fg-2">.stay</span> или <span className="num text-fg-2">.switch</span>.
      </p>
    </section>
  );
}

/** Сервер готовится: спокойный статус, страница обновится сама */
export function ServerPreparing({ loading }: { loading: boolean }) {
  return (
    <section className="rounded-2xl bg-surface p-6 sm:p-10">
      <div className="flex items-center gap-3">
        <span className="relative flex size-2.5">
          <span className="absolute inset-0 rounded-full bg-accent/60 animate-ping" />
          <span className="relative size-2.5 rounded-full bg-accent" />
        </span>
        <h2 className="text-[22px] sm:text-[28px] font-bold tracking-[-0.025em]">Подготавливаем сервер</h2>
      </div>
      <p className="mt-3 text-fg-2 max-w-lg">
        {loading
          ? "Загружаем карту и проверяем составы. Адрес появится здесь — страница обновится сама."
          : "Сервер скоро будет назначен. Адрес появится здесь — страница обновится сама."}
      </p>
      <div className="mt-6 h-1 w-full max-w-md overflow-hidden rounded-full bg-white/[0.05]">
        <div className={loading ? "h-full w-2/3 bg-accent/60 rounded-full" : "h-full w-1/4 bg-accent/40 rounded-full"} />
      </div>
    </section>
  );
}
