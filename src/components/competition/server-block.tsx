import { mapName } from "@/lib/format";
import { CopyConnect } from "../copy-connect";
import { CriticalSurface, FeatureSurface, Timer } from "@/components/ds";
import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/core";

/** Ссылка подключения Steam — одна на всю страницу */
export function connectHref(address: string, password: string | null) {
  return `steam://connect/${address}${password ? `/${password}` : ""}`;
}

/** Сервер готов: одно главное действие, рядом только данные, нужные игроку. */
export async function ServerReady({
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
  const t = await getT();
  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className={`text-micro font-semibold uppercase tracking-[0.14em] ${waiting ? "text-ok" : "text-live"}`}>
            {waiting ? t("Сервер готов") : t("Матч идёт")}
          </div>
          <h2 className="mt-2 text-heading text-fg">{waiting ? t("Подключайтесь к серверу") : t("Сервер матча")}</h2>
          <div className="num mt-3 text-[24px] font-semibold tracking-[-0.02em] text-fg sm:text-[34px]">{address}</div>
        </div>
        {waiting && readyAt && (
          <div className="text-right">
            <div className="text-micro text-fg-3">{t("На подключение")}</div>
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
        <CopyConnect address={address} password={password} />
        <code className="num select-all rounded-control border border-line bg-shell px-3 py-2.5 text-[14px] text-fg-2">
          connect {address}{password ? `; password ${password}` : ""}
        </code>
        {map && <span className="text-[14px] text-fg-2">{t("Карта")}: <strong className="font-medium text-fg">{mapName(map)}</strong></span>}
      </div>

      <ol className="mt-6 grid gap-1.5 text-meta text-fg-3">
        <li><span className="num mr-2 text-fg-4">01</span>{t("Нажмите «Скопировать IP» и вставьте в консоль CS2 (~).")}</li>
        <li><span className="num mr-2 text-fg-4">02</span>{t.rich("В разминке напишите <c>.ready</c>.", { c: (x) => <span className="num text-fg-2">{x}</span> })}</li>
        <li><span className="num mr-2 text-fg-4">03</span>{t.rich("После ножевого — <c>.stay</c> / <c>.switch</c>.", { c: (x) => <span className="num text-fg-2">{x}</span> })}</li>
      </ol>
    </>
  );

  return waiting ? <CriticalSurface tone="ok">{content}</CriticalSurface> : <FeatureSurface>{content}</FeatureSurface>;
}

/** Сервер готовится: страница остаётся в Match Room и сама переходит в следующий state. */
export async function ServerPreparing({ loading }: { loading: boolean }) {
  const t = await getT();
  return (
    <FeatureSurface>
      <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">{t("Сервер")}</div>
      <h2 className="mt-2 text-heading text-fg">{t("Подготавливаем сервер")}</h2>
      <p className="mt-2 max-w-read text-[14px] text-fg-2">
        {loading
          ? t("Загружаем карту и проверяем составы. Адрес появится здесь автоматически.")
          : t("Сервер будет назначен автоматически. Оставаться на этой странице достаточно.")}
      </p>
      <div className="mt-6 grid max-w-xl grid-cols-3 gap-3">
        {[tr("Сервер"), tr("Карта"), tr("Адрес")].map((label, i) => {
          const done = loading ? i === 0 : false;
          const current = loading ? i === 1 : i === 0;
          return (
            <div key={label}>
              <div className="h-1 overflow-hidden rounded-full bg-ink/[0.07]">
                <div className={done ? "h-full w-full bg-accent/70" : current ? "h-full w-1/2 animate-pulse bg-accent" : "h-0"} />
              </div>
              <div className={`mt-2 text-micro ${current ? "text-fg" : done ? "text-fg-2" : "text-fg-4"}`}>{t(label)}</div>
            </div>
          );
        })}
      </div>
    </FeatureSurface>
  );
}
