"use client";

import { useActionState, useRef } from "react";
import { removeMapImage, toggleMapEnabled, uploadMapImage } from "@/app/actions/admin-settings";
import { MapTile } from "@/components/competition/map-tile";
import { cn } from "@/components/ui";

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
  const [, remove] = useActionState(removeMapImage, null);
  const [, toggle, toggling] = useActionState(toggleMapEnabled, null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className={cn("space-y-2", !enabled && "opacity-55")}>
      <button type="button" onClick={() => fileRef.current?.click()} className="block w-full text-left" title="Загрузить картинку">
        <MapTile map={map} image={image} caption={uploading ? "загрузка…" : image ? "сменить картинку" : "загрузить картинку"} interactive />
      </button>
      <form ref={formRef} action={upload} className="hidden">
        <input type="hidden" name="map" value={map} />
        <input
          ref={fileRef}
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp"
          onChange={() => formRef.current?.requestSubmit()}
        />
      </form>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        {toggleable ? (
          <form action={toggle}>
            <input type="hidden" name="map" value={map} />
            <button
              type="submit"
              disabled={toggling}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-2 rounded-md transition",
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
            <button type="submit" className="h-7 px-2 rounded-md text-fg-3 hover:text-danger hover:bg-white/[0.04]">
              убрать картинку
            </button>
          </form>
        )}
      </div>
      {upState?.error && <p className="text-[12px] text-danger">{upState.error}</p>}
    </div>
  );
}
