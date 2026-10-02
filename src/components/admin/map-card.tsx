"use client";

import { useActionState, useEffect, useRef } from "react";
import { removeMapImage, toggleMapEnabled, uploadMapImage } from "@/app/actions/admin-settings";
import { MapTile } from "@/components/competition/map-tile";
import type { ActionResult } from "@/components/forms";
import { useToast } from "@/components/toast";
import { cn } from "@/components/ui";

/** Результат действия — уведомлением в углу */
function useResultToast(state: ActionResult) {
  const toast = useToast();
  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.success) toast.success(state.success);
  }, [state, toast]);
}

/** Карта в «Настройки → Карты»: превью, загрузка картинки по клику, доступна/скрыта */
export function MapCard({
  map,
  image,
  enabled,
  toggleable = true,
}: {
  map: string;
  image: string | null;
  enabled: boolean;
  toggleable?: boolean;
}) {
  const [upState, upload, uploading] = useActionState(uploadMapImage, null);
  const [rmState, remove, removing] = useActionState(removeMapImage, null);
  const [tgState, toggle, toggling] = useActionState(toggleMapEnabled, null);
  useResultToast(upState);
  useResultToast(rmState);
  useResultToast(tgState);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className={cn("space-y-2 transition-opacity", !enabled && "opacity-55")}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        title="Загрузить картинку"
        aria-label={`${image ? "Сменить" : "Загрузить"} картинку карты`}
      >
        <MapTile map={map} image={image} caption={uploading ? "загрузка…" : image ? "сменить картинку" : "загрузить картинку"} interactive />
      </button>
      <form ref={formRef} action={upload} className="hidden">
        <input type="hidden" name="map" value={map} />
        <input
          ref={fileRef}
          type="file"
          name="image"
          aria-label={`Картинка карты ${map}`}
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            // больше 3 МБ сервер не примет — сказать сразу, а не ронять страницу
            if (f.size > 3 * 1024 * 1024) {
              toast.error(`Картинка ${(f.size / 1024 / 1024).toFixed(1)} МБ — нужно до 3 МБ. Сожмите в JPG или WEBP.`);
              e.target.value = "";
              return;
            }
            formRef.current?.requestSubmit();
          }}
        />
      </form>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        {toggleable ? (
          <form action={toggle}>
            <input type="hidden" name="map" value={map} />
            <button
              type="submit"
              disabled={toggling}
              aria-pressed={enabled}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                enabled ? "text-ok hover:bg-white/[0.04]" : "text-fg-3 hover:bg-white/[0.04]",
              )}
            >
              <span className={cn("size-1.5 rounded-full", enabled ? "bg-ok" : "bg-fg-3")} />
              {enabled ? "Доступна" : "Скрыта"}
            </button>
          </form>
        ) : (
          <span className="text-fg-3">Workshop</span>
        )}
        {image && (
          <form action={remove}>
            <input type="hidden" name="map" value={map} />
            <button
              type="submit"
              disabled={removing}
              className="h-8 rounded-md px-2 text-fg-3 transition-colors hover:bg-white/[0.04] hover:text-danger disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              убрать картинку
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
