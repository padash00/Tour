"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { removeMapImage, uploadMapImage, toggleMapEnabled } from "@/app/actions/admin-settings";
import { MapTile } from "@/components/competition/map-tile";
import { ActionToggle } from "@/components/admin/action-toggle";
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
  useResultToast(upState);
  useResultToast(rmState);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const visibleEnabled = optimisticEnabled ?? enabled;

  useEffect(() => {
    if (optimisticEnabled !== null && optimisticEnabled === enabled) setOptimisticEnabled(null);
  }, [enabled, optimisticEnabled]);

  return (
    <div className={cn("space-y-2 transition-opacity", !visibleEnabled && "opacity-55")}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        title="Загрузить картинку"
        aria-label={`${image ? "Сменить" : "Загрузить"} картинку карты`}
      >
        <MapTile map={map} image={image} caption={uploading ? "загрузка…" : image ? "сменить картинку" : "загрузить картинку"} interactive />
      </button>
      <form ref={formRef} action={upload} data-f16-action-pending={uploading ? "true" : undefined} className="hidden">
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
          <ActionToggle
            action={toggleMapEnabled}
            fields={{ map }}
            stateField="enabled"
            on={enabled}
            label={`Карта ${map}`}
            onLabel="Доступна"
            offLabel="Скрыта"
            onOptimisticChange={setOptimisticEnabled}
          />
        ) : (
          <span className="text-fg-3">Workshop</span>
        )}
        {image && (
          <form action={remove} data-f16-action-pending={removing ? "true" : undefined}>
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
