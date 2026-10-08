import { CopyField } from "@/components/forms";
import { SITE_URL } from "@/lib/site";
import { ADMIN_CARD } from "./control";

/**
 * Ссылки на оверлей трансляции (/overlay) для оператора OBS.
 * По инстансу — показывает любой матч турнира на этом сервере; по матчу — именно этот матч, даже если его перенесут.
 */
export const overlayUrl = (q: { server: string } | { match: string }) =>
  "server" in q ? `${SITE_URL}/overlay?server=${encodeURIComponent(q.server)}` : `${SITE_URL}/overlay?match=${q.match}`;

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
