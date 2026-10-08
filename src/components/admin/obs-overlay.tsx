import { CopyField } from "@/components/forms";
import { SITE_URL } from "@/lib/site";
import { ADMIN_CARD } from "./control";

/**
 * Ссылки на оверлей трансляции (/overlay) для оператора OBS.
 * По инстансу — показывает любой матч турнира на этом сервере; по матчу — именно этот матч, даже если его перенесут.
 */
export const overlayUrl = (q: { server: string } | { match: string } | { tournament: string }) =>
  "server" in q
    ? `${SITE_URL}/overlay?server=${encodeURIComponent(q.server)}`
    : "match" in q
      ? `${SITE_URL}/overlay?match=${q.match}`
      : `${SITE_URL}/overlay?tournament=${encodeURIComponent(q.tournament)}`;

/** Экран перерыва (/broadcast): все сцены по кругу или одна сцена */
export const broadcastUrl = (slug: string, scene?: "bracket" | "schedule" | "live" | "stats") =>
  `${SITE_URL}/broadcast?tournament=${encodeURIComponent(slug)}${scene ? `&scene=${scene}` : ""}`;

export function ObsHowTo() {
  return (
    <p className="text-[12px] leading-relaxed text-fg-3">
      OBS → Источник → <span className="text-fg-2">Браузер</span> → URL, ширина <span className="num">1920</span>, высота{" "}
      <span className="num">1080</span>, галочка «Обновлять браузер при активации». Фон прозрачный — источник ставится поверх
      захвата CS2 (GOTV). Параметры: <span className="num">&amp;lower=1</span> — плашка F16 Arena внизу,{" "}
      <span className="num">&amp;theme=clear</span> — полупрозрачные панели, <span className="num">&amp;idle=hide</span> — без
      «Скоро» между матчами, <span className="num">&amp;scale=1.25</span> — крупнее.
    </p>
  );
}

/** Карточка на странице «Серверы»: по ссылке на каждый инстанс */
export function ObsOverlayPanel({ instances }: { instances: { name: string; match?: string | null }[] }) {
  return (
    <div className={`${ADMIN_CARD} space-y-4 p-4`}>
      <ObsHowTo />
      <div className="grid gap-x-6 gap-y-3 xl:grid-cols-2">
        {instances.map((s) => (
          <div key={s.name} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
            <div className="min-w-0">
              <div className="num text-[13px] font-semibold">{s.name}</div>
              <div className="truncate text-[11px] text-fg-3">{s.match ?? "матча нет"}</div>
            </div>
            <CopyField value={overlayUrl({ server: s.name })} />
          </div>
        ))}
      </div>
    </div>
  );
}

const BROADCAST_SCENES = [
  ["bracket", "Сетка"],
  ["schedule", "Расписание"],
  ["live", "Идут матчи"],
  ["stats", "Лидеры"],
] as const;

/**
 * Блок «Трансляция» на странице турнира в F16 Control: экран перерыва (сцена «Перерыв» в OBS),
 * отдельные сцены и оверлей счёта поверх GOTV.
 */
export function BroadcastPanel({ slug }: { slug: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-fg-3">
        OBS → Источник → <span className="text-fg-2">Браузер</span> → URL, ширина <span className="num">1920</span>, высота{" "}
        <span className="num">1080</span>. Экран перерыва — на фирменном фоне, для сцены «Перерыв» между картами и матчами: сам
        крутит сетку, расписание, идущие матчи и лидеров (пустые сцены пропускает). Параметры:{" "}
        <span className="num">&amp;interval=20</span> — секунд на сцену, <span className="num">&amp;lower=1</span> — бегущая строка со
        счётом, <span className="num">&amp;footer=Партнёр…</span> — текст партнёра в подвале.
      </p>
      <div className="space-y-3">
        <BroadcastLink label="Экран перерыва" hint="все сцены по кругу" value={broadcastUrl(slug)} />
        {BROADCAST_SCENES.map(([scene, label]) => (
          <BroadcastLink key={scene} label={label} hint="одна сцена" value={broadcastUrl(slug, scene)} />
        ))}
        <BroadcastLink label="Оверлей счёта" hint="прозрачный, поверх GOTV" value={overlayUrl({ tournament: slug })} />
      </div>
    </div>
  );
}

function BroadcastLink({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-1.5 md:grid-cols-[180px_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-fg">{label}</div>
        <div className="text-[11px] text-fg-3">{hint}</div>
      </div>
      <CopyField value={value} />
    </div>
  );
}
