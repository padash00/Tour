import { mapName } from "@/lib/format";
import { cn } from "../ui";

// приглушённый оттенок для каждой карты — единая система вместо случайных картинок
const TINT: Record<string, [string, string]> = {
  de_mirage: ["#3a3226", "#1a1712"],
  de_inferno: ["#3b2a22", "#1a1310"],
  de_nuke: ["#23303a", "#10161b"],
  de_ancient: ["#26332b", "#111813"],
  de_anubis: ["#36302a", "#181512"],
  de_dust2: ["#3a3424", "#1a1710"],
  de_train: ["#2b2f33", "#131517"],
  de_overpass: ["#2a3330", "#131716"],
  de_vertigo: ["#2a2f3a", "#12151b"],
};

function tint(map: string): [string, string] {
  const key = map.split("@")[0];
  if (TINT[key]) return TINT[key];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 360;
  return [`hsl(${h} 14% 19%)`, `hsl(${h} 14% 8%)`];
}

export type MapTileState = "available" | "banned" | "picked" | "decider" | "pending";

/** Плитка карты: затемнённая, низкая насыщенность, крупное читаемое имя */
export function MapTile({
  map,
  state = "available",
  caption,
  interactive,
  className,
  image,
}: {
  map: string;
  state?: MapTileState;
  caption?: string;
  interactive?: boolean;
  className?: string;
  /** картинка карты из «Настройки → Карты» */
  image?: string | null;
}) {
  const [a, b] = tint(map);
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl h-24 sm:h-28 p-4 flex flex-col justify-end text-left transition-all duration-200 w-full",
        state === "banned" && "opacity-35 grayscale",
        state === "picked" && "ring-1 ring-accent/70",
        state === "decider" && "ring-1 ring-ok/70",
        interactive && "cursor-pointer hover:ring-1 hover:ring-white/40 hover:-translate-y-px",
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}
    >
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover saturate-[0.55] brightness-[0.7]" />
          <span className="absolute inset-0 bg-gradient-to-t from-[#070b12f0] via-[#070b1266] to-transparent" />
        </>
      ) : (
        <span className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,#ffffff0d,transparent_60%)]" />
      )}
      <span className={cn("relative text-[17px] font-semibold tracking-[-0.01em]", state === "banned" && "line-through decoration-1")}>
        {mapName(map)}
      </span>
      <span
        className={cn(
          "relative mt-0.5 text-[12px] h-4",
          state === "picked" ? "text-accent" : state === "decider" ? "text-ok" : "text-fg-3",
        )}
      >
        {caption ?? ""}
      </span>
    </div>
  );
}
