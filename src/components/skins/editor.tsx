"use client";

import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { resetAllSkins, saveSkins } from "@/app/actions/skins";
import { Button, Callout, Checkbox, ConfirmDialog, Dialog, Field, Input, SearchInput, Segmented, Select, Toggle, cn } from "@/components/ds";
import { useT } from "@/lib/i18n/client";
import {
  DEFAULT_KNIFE,
  NAMETAG_MAX,
  SEED_MAX,
  WEAR_DEFAULT,
  wearName,
  type CatalogWeapon,
  type Loadout,
  type SkinCatalog,
  type SkinItem,
  type SkinOp,
  type SkinTeam,
} from "@/lib/skins-core";
import { useToast } from "../toast";

/*
 * Раздел «Скины»: плитка на каждое оружие, нож и перчатки — отдельно для CT и T.
 * Плитка с выбранным скином показывает картинку и износ, пустая — «Добавить …». По клику — выбор раскраски,
 * износ (float), шаблон, StatTrak и бирка. Сохранённое уходит на игровые серверы клуба.
 */

type Slot = { kind: "weapon"; weapon: CatalogWeapon } | { kind: "knife" } | { kind: "glove" };

const wearShort = (w: number) => (w < 0.07 ? "FN" : w < 0.15 ? "MW" : w < 0.38 ? "FT" : w < 0.45 ? "WW" : "BS");
const other = (t: SkinTeam): SkinTeam => (t === 3 ? 2 : 3);

function Shot({ src, alt, dim, className }: { src: string; alt: string; dim?: boolean; className?: string }) {
  return (
    // картинки каталога лежат на стороннем хостинге — next/image для них не настроен
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      className={cn("mx-auto h-full w-full object-contain", dim && "opacity-25 grayscale", className)}
    />
  );
}

function Tile({ title, sub, wear, image, empty, onClick }: { title: string; sub?: string; wear?: number; image: string; empty: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[168px] flex-col rounded-surface border p-3 text-left transition-[border-color,background-color]",
        empty ? "border-line-subtle bg-surface hover:border-line-strong" : "border-accent/30 bg-accent-dim/40 hover:border-accent/60",
      )}
    >
      <div className="relative h-[84px] w-full">
        {image ? <Shot src={image} alt="" dim={empty} /> : null}
        {empty && (
          <span className="absolute inset-0 grid place-items-center text-fg-3 opacity-0 transition-opacity group-hover:opacity-100">
            <Plus className="size-6" />
          </span>
        )}
      </div>
      <div className="mt-auto min-w-0 pt-2">
        {wear !== undefined && <div className="num text-micro font-semibold text-accent" title={t(wearName(wear))}>{wearShort(wear)} · {wear.toFixed(3)}</div>}
        <div className={cn("truncate text-[13px] font-semibold", empty ? "text-fg-3" : "text-fg")}>{empty ? t("Добавить {name}", { name: title }) : title}</div>
        {sub ? <div className="truncate text-meta text-fg-2">{sub}</div> : null}
      </div>
    </button>
  );
}

export function SkinEditor({ loadout, pending, stale, enabled }: { loadout: Loadout; pending: number; stale: boolean; enabled: boolean }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [catalog, setCatalog] = useState<SkinCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [team, setTeam] = useState<SkinTeam>(3);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, start] = useTransition();

  useEffect(() => {
    let alive = true;
    fetch("/skins/catalog.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((c: SkinCatalog) => alive && setCatalog(c))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // пока правки едут на сервер — перечитываем страницу, чтобы пометка «отправляется» сама исчезла
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => router.refresh(), 8000);
    return () => clearTimeout(id);
  }, [pending, router, loadout]);

  const mine = useMemo(() => new Map(loadout.skins.filter((s) => s.t === team).map((s) => [s.d, s])), [loadout, team]);

  const save = (ops: SkinOp[], done?: () => void) =>
    start(async () => {
      const r = await saveSkins(ops);
      if (r.error) return void toast.error(r.error);
      toast.success(t("Сохранено. В игре — при следующем заходе на сервер или по команде !wp"));
      done?.();
    });

  if (failed) return <Callout tone="danger">{t("Каталог скинов не загрузился — обновите страницу.")}</Callout>;
  if (!catalog) return <div className="h-40 animate-pulse rounded-surface bg-surface" />;

  const img = catalog.img;
  const guns = catalog.weapons.filter((w) => w.g !== "knife");
  const knives = catalog.weapons.filter((w) => w.g === "knife");
  const knife = knives.find((k) => k.w === loadout.knife[team]);
  const knifeSkin = knife ? mine.get(knife.d) : undefined;
  const glove = catalog.gloves.find((g) => g.d === loadout.gloves[team]);
  const gloveSkin = glove ? mine.get(glove.d) : undefined;
  const glovePaint = glove?.paints.find((p) => p[0] === gloveSkin?.p);
  const paintName = (w: CatalogWeapon, s?: SkinItem) => w.paints.find((p) => p[0] === s?.p)?.[1];
  // выбранные — первыми, как на витрине
  const ordered = [...guns].sort((a, b) => Number(mine.has(b.d)) - Number(mine.has(a.d)));
  const total = loadout.skins.length + Object.keys(loadout.knife).length;

  return (
    <div>
      {!enabled && <Callout tone="warn" className="mb-4">{t("Скины на серверах клуба сейчас выключены администратором. Набор можно собрать заранее — он заработает, когда их включат.")}</Callout>}
      {stale ? (
        <Callout tone="warn" className="mb-4">{t("Изменения ещё не дошли до игрового сервера: серверный ПК не на связи. Они применятся сами, когда связь вернётся.")}</Callout>
      ) : pending > 0 ? (
        <Callout tone="info" className="mb-4">{t("Изменения отправляются на игровой сервер — обычно это до 15 секунд.")}</Callout>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<SkinTeam>
          label={t("Сторона")}
          value={team}
          onChange={setTeam}
          options={[
            { value: 3, label: t("Спецназ (CT)") },
            { value: 2, label: t("Террористы (T)") },
          ]}
        />
        <Button variant="ghost" icon={<RotateCcw />} onClick={() => setConfirmReset(true)} disabled={busy || total === 0}>
          {t("Сбросить все скины")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Tile
          title={knife ? knife.name : t("нож")}
          sub={knife ? (paintName(knife, knifeSkin) ?? t("Без раскраски")) : undefined}
          wear={knifeSkin?.w}
          image={knife ? `${img}${knife.w}${knifeSkin ? `-${knifeSkin.p}` : ""}.png` : `${img}weapon_knife_karambit.png`}
          empty={!knife}
          onClick={() => setSlot({ kind: "knife" })}
        />
        <Tile
          title={glove ? glove.name : t("перчатки")}
          sub={glovePaint?.[1]}
          wear={gloveSkin?.w}
          image={glovePaint ? `${img}${glovePaint[2]}-${glovePaint[0]}.png` : ""}
          empty={!glove}
          onClick={() => setSlot({ kind: "glove" })}
        />
        {ordered.map((w) => {
          const s = mine.get(w.d);
          return (
            <Tile
              key={w.d}
              title={w.name}
              sub={paintName(w, s)}
              wear={s?.w}
              image={`${img}${w.w}${s ? `-${s.p}` : ""}.png`}
              empty={!s}
              onClick={() => setSlot({ kind: "weapon", weapon: w })}
            />
          );
        })}
      </div>

      {slot && (
        <Picker
          key={`${slot.kind}${slot.kind === "weapon" ? slot.weapon.d : ""}${team}`}
          slot={slot}
          team={team}
          catalog={catalog}
          loadout={loadout}
          busy={busy}
          onClose={() => !busy && setSlot(null)}
          onSave={(ops) => save(ops, () => setSlot(null))}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        title={t("Сбросить все скины?")}
        description={t("Уберутся все раскраски, нож и перчатки на обеих сторонах. В игре останется стандартное оружие.")}
        confirmLabel={t("Сбросить")}
        danger
        loading={busy}
        onConfirm={() =>
          start(async () => {
            const r = await resetAllSkins();
            if (r.error) toast.error(r.error);
            else toast.success(t("Скины сброшены"));
            setConfirmReset(false);
          })
        }
      />
    </div>
  );
}

function Picker({
  slot,
  team,
  catalog,
  loadout,
  busy,
  onClose,
  onSave,
}: {
  slot: Slot;
  team: SkinTeam;
  catalog: SkinCatalog;
  loadout: Loadout;
  busy: boolean;
  onClose: () => void;
  onSave: (ops: SkinOp[]) => void;
}) {
  const t = useT();
  const img = catalog.img;
  const knives = useMemo(() => catalog.weapons.filter((w) => w.g === "knife"), [catalog]);
  const skinOf = (d: number | undefined) => loadout.skins.find((s) => s.t === team && s.d === d);

  // модель: для оружия она одна, для ножа и перчаток выбирается здесь же (0 — стандартные)
  const startModel = slot.kind === "weapon" ? slot.weapon.d : slot.kind === "knife" ? (knives.find((k) => k.w === loadout.knife[team])?.d ?? 0) : (loadout.gloves[team] ?? 0);
  const [model, setModel] = useState(startModel);
  const current = skinOf(startModel || undefined);
  const [paint, setPaint] = useState(current?.p ?? 0);
  const [wear, setWear] = useState(current?.w ?? WEAR_DEFAULT);
  const [seed, setSeed] = useState(String(current?.s ?? 0));
  const [stattrak, setStattrak] = useState(current?.st === 1);
  const [nametag, setNametag] = useState(current?.n ?? "");
  const [both, setBoth] = useState(false);
  const [search, setSearch] = useState("");

  const weapon = slot.kind === "glove" ? undefined : slot.kind === "weapon" ? slot.weapon : knives.find((k) => k.d === model);
  const glove = slot.kind === "glove" ? catalog.gloves.find((g) => g.d === model) : undefined;
  const paints: { id: number; name: string; image: string }[] = weapon
    ? weapon.paints.map(([id, name]) => ({ id, name, image: `${img}${weapon.w}-${id}.png` }))
    : (glove?.paints.map(([id, name, stem]) => ({ id, name, image: `${img}${stem}-${id}.png` })) ?? []);
  const q = search.trim().toLowerCase();
  const shown = q ? paints.filter((p) => p.name.toLowerCase().includes(q)) : paints;
  const picked = paints.find((p) => p.id === paint);
  const seedNum = Math.min(SEED_MAX, Math.max(0, Math.round(Number(seed) || 0)));

  const pickModel = (d: number) => {
    setModel(d);
    setPaint(skinOf(d)?.p ?? 0);
    setSearch("");
  };

  const title = slot.kind === "weapon" ? slot.weapon.name : slot.kind === "knife" ? t("Нож") : t("Перчатки");
  const teams: SkinTeam[] = both ? [team, other(team)] : [team];
  // что можно сохранить: оружию нужна раскраска; ножу — модель (раскраска по желанию); перчаткам — модель с раскраской или «стандартные»
  const canSave = slot.kind === "weapon" ? paint > 0 : slot.kind === "knife" ? true : model === 0 || paint > 0;
  const hasNow = slot.kind === "weapon" ? !!current : startModel !== 0;

  const build = (): SkinOp[] =>
    teams.flatMap((tm): SkinOp[] => {
      const item = { t: tm, d: model, p: paint, w: wear, s: seedNum };
      if (slot.kind === "weapon") return [{ k: "skin", ...item, n: nametag.trim() || null, st: stattrak ? 1 : 0 }];
      if (slot.kind === "glove") return [{ k: "glove", ...item, ...(model === 0 ? { p: 0, w: 0, s: 0 } : {}) }];
      if (!weapon) return [{ k: "knife", t: tm, v: DEFAULT_KNIFE }];
      return [{ k: "knife", t: tm, v: weapon.w }, paint > 0 ? { k: "skin", ...item, n: nametag.trim() || null, st: stattrak ? 1 : 0 } : { k: "reset", t: tm, d: model }];
    });

  const remove = (): SkinOp[] =>
    teams.map((tm): SkinOp => (slot.kind === "weapon" ? { k: "reset", t: tm, d: slot.weapon.d } : slot.kind === "knife" ? { k: "knife", t: tm, v: DEFAULT_KNIFE } : { k: "glove", t: tm, d: 0, p: 0, w: 0, s: 0 }));

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={team === 3 ? t("Сторона: спецназ (CT)") : t("Сторона: террористы (T)")}
      size="lg"
      footer={
        <>
          {hasNow && (
            <Button variant="ghost" icon={<Trash2 />} onClick={() => onSave(remove())} disabled={busy} className="mr-auto">
              {t("Убрать")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("Отмена")}
          </Button>
          <Button onClick={() => onSave(build())} loading={busy} disabled={!canSave}>
            {t("Сохранить")}
          </Button>
        </>
      }
    >
      {slot.kind !== "weapon" && (
        <Field className="mb-4" label={slot.kind === "knife" ? t("Модель ножа") : t("Модель перчаток")}>
          {(field) => (
            <Select {...field} value={String(model)} onChange={(e) => pickModel(Number(e.target.value))}>
              <option value="0">{slot.kind === "knife" ? t("Стандартный нож") : t("Стандартные перчатки")}</option>
              {(slot.kind === "knife" ? knives : catalog.gloves).map((m) => (
                <option key={m.d} value={m.d}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {paints.length > 0 && (
        <>
          <SearchInput value={search} onChange={setSearch} placeholder={t("Поиск раскраски")} />
          <div className="mt-3 grid max-h-[300px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
            {slot.kind === "knife" && !q && (
              <PaintCard name={t("Без раскраски")} image={weapon ? `${img}${weapon.w}.png` : ""} on={paint === 0} onClick={() => setPaint(0)} />
            )}
            {shown.map((p) => (
              <PaintCard key={p.id} name={p.name} image={p.image} on={paint === p.id} onClick={() => setPaint(p.id)} />
            ))}
            {shown.length === 0 && <div className="col-span-full py-6 text-center text-meta text-fg-3">{t("Ничего не найдено")}</div>}
          </div>
        </>
      )}

      {paint > 0 && picked && (
        <div className="mt-5 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="rounded-control border border-line-subtle bg-shell p-3">
            <div className="h-[96px]">
              <Shot src={picked.image} alt={picked.name} />
            </div>
            <div className="mt-2 truncate text-center text-meta text-fg-2">{picked.name}</div>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="skin-wear" className="text-[13px] font-semibold text-fg">
                {t("Износ (float)")}
              </label>
              <span className="num text-meta text-fg-2">
                {wear.toFixed(3)} · {t(wearName(wear))}
              </span>
            </div>
            <input
              id="skin-wear"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={wear}
              onChange={(e) => setWear(Number(e.target.value))}
              className="mt-2 w-full accent-[var(--color-accent)]"
            />
            <div className="num mt-1 flex justify-between text-micro text-fg-3">
              <span>FN</span>
              <span>MW</span>
              <span>FT</span>
              <span>WW</span>
              <span>BS</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={t("Шаблон (pattern)")} hint={t("От 0 до 1000")}>
                {(field) => <Input {...field} type="number" inputMode="numeric" min={0} max={SEED_MAX} value={seed} onChange={(e) => setSeed(e.target.value)} />}
              </Field>
              {slot.kind !== "glove" && (
                <Field label={t("Бирка с именем")} hint={t("До {n} знаков", { n: NAMETAG_MAX })}>
                  {(field) => <Input {...field} type="text" maxLength={NAMETAG_MAX} value={nametag} onChange={(e) => setNametag(e.target.value)} autoComplete="off" />}
                </Field>
              )}
            </div>
            {slot.kind !== "glove" && (
              <div className="mt-3 flex items-center gap-3">
                <Toggle on={stattrak} onChange={setStattrak} label="StatTrak" />
                <span className="text-meta text-fg-2">StatTrak™</span>
              </div>
            )}
          </div>
        </div>
      )}

      <Checkbox className="mt-5" checked={both} onChange={(e) => setBoth(e.target.checked)} label={t("Применить к обеим сторонам")} description={t("То же самое — и за CT, и за T.")} />
    </Dialog>
  );
}

function PaintCard({ name, image, on, onClick }: { name: string; image: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-control border p-2 text-left transition-[border-color,background-color]", on ? "border-accent/60 bg-accent-dim" : "border-line-subtle bg-surface hover:border-line-strong")}
    >
      <div className="h-[56px]">{image ? <Shot src={image} alt="" /> : null}</div>
      <div className="mt-1 truncate text-micro text-fg-2">{name}</div>
    </button>
  );
}
