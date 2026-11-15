// Скины игрока: формат набора и изменений. Чистая логика — общая для сайта, агента (проверка) и тестов.
// Набор хранится в базе плагина WeaponPaints на серверном ПК; сайт держит его зеркало (player_skins)
// и очередь изменений (skin_ops), которые агент переносит в базу плагина.

/** Сторона, как в плагине: 2 — T, 3 — CT */
export type SkinTeam = 2 | 3;
export const SKIN_TEAMS: SkinTeam[] = [3, 2];

/** Раскраска одного оружия (или ножа, или перчаток) на одной стороне */
export type SkinItem = {
  t: SkinTeam;
  /** defindex оружия */
  d: number;
  /** paint — номер раскраски */
  p: number;
  /** износ (float) 0…1 */
  w: number;
  /** шаблон (seed) 0…1000 */
  s: number;
  /** именная бирка */
  n: string | null;
  /** StatTrak */
  st: 0 | 1;
};

export type Loadout = {
  skins: SkinItem[];
  /** модель ножа по сторонам: "weapon_knife_karambit"; нет записи — стандартный */
  knife: Partial<Record<SkinTeam, string>>;
  /** defindex перчаток по сторонам; нет записи — стандартные */
  gloves: Partial<Record<SkinTeam, number>>;
};

export type SkinOp =
  | ({ k: "skin" } & SkinItem)
  | { k: "reset"; t: SkinTeam; d: number }
  | { k: "knife"; t: SkinTeam; v: string }
  | { k: "glove"; t: SkinTeam; d: number; p: number; w: number; s: number };

export const DEFAULT_KNIFE = "weapon_knife";
export const WEAR_DEFAULT = 0.01;
export const SEED_MAX = 1000;
export const NAMETAG_MAX = 20;

export const EMPTY_LOADOUT: Loadout = { skins: [], knife: {}, gloves: {} };

const isTeam = (v: unknown): v is SkinTeam => v === 2 || v === 3;
const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);
const wear = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 1e6) / 1e6 : null);

/** Бирка: без управляющих символов и кавычек, до 20 знаков; пустая — нет бирки */
export function cleanNametag(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f"'`\\;<>]/g, "").replace(/\s+/g, " ").trim().slice(0, NAMETAG_MAX);
  return s || null;
}

/** Проверка и приведение изменения (с сайта, из базы, на агенте). Непонятное — null */
export function parseOp(raw: unknown): SkinOp | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isTeam(o.t)) return null;
  if (o.k === "skin") {
    const d = int(o.d, 1, 99999), p = int(o.p, 1, 99999), w = wear(o.w), s = int(o.s, 0, SEED_MAX);
    if (d === null || p === null || w === null || s === null) return null;
    return { k: "skin", t: o.t, d, p, w, s, n: cleanNametag(o.n), st: o.st === 1 || o.st === true ? 1 : 0 };
  }
  if (o.k === "reset") {
    const d = int(o.d, 1, 99999);
    return d === null ? null : { k: "reset", t: o.t, d };
  }
  if (o.k === "knife") {
    return typeof o.v === "string" && /^weapon_(knife[a-z0-9_]{0,40}|bayonet)$/.test(o.v) ? { k: "knife", t: o.t, v: o.v } : null;
  }
  if (o.k === "glove") {
    const d = int(o.d, 0, 99999);
    if (d === null) return null;
    if (d === 0) return { k: "glove", t: o.t, d: 0, p: 0, w: 0, s: 0 };
    const p = int(o.p, 1, 99999), w = wear(o.w), s = int(o.s, 0, SEED_MAX);
    return p === null || w === null || s === null ? null : { k: "glove", t: o.t, d, p, w, s };
  }
  return null;
}

/** Набор из базы (jsonb) — к виду Loadout; мусор отбрасывается */
export function parseLoadout(raw: unknown): Loadout {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const skins: SkinItem[] = [];
  for (const x of Array.isArray(o.skins) ? o.skins : []) {
    const op = parseOp({ ...(x as object), k: "skin" });
    if (op?.k === "skin") skins.push({ t: op.t, d: op.d, p: op.p, w: op.w, s: op.s, n: op.n, st: op.st });
  }
  const knife: Loadout["knife"] = {};
  const gloves: Loadout["gloves"] = {};
  for (const t of SKIN_TEAMS) {
    const k = (o.knife as Record<string, unknown> | undefined)?.[t];
    if (typeof k === "string" && k !== DEFAULT_KNIFE && parseOp({ k: "knife", t, v: k })) knife[t] = k;
    const g = int((o.gloves as Record<string, unknown> | undefined)?.[t], 1, 99999);
    if (g !== null) gloves[t] = g;
  }
  return { skins, knife, gloves };
}

/** Набор после изменения. Перчатки: одна пара на сторону — раскраска прежней пары убирается */
export function applyOp(loadout: Loadout, op: SkinOp): Loadout {
  const without = (t: SkinTeam, d: number) => loadout.skins.filter((x) => !(x.t === t && x.d === d));
  if (op.k === "skin") {
    const { k: _k, ...item } = op;
    void _k;
    return { ...loadout, skins: [...without(op.t, op.d), item] };
  }
  if (op.k === "reset") return { ...loadout, skins: without(op.t, op.d) };
  if (op.k === "knife") {
    const knife = { ...loadout.knife };
    if (op.v === DEFAULT_KNIFE) delete knife[op.t];
    else knife[op.t] = op.v;
    return { ...loadout, knife };
  }
  const gloves = { ...loadout.gloves };
  const old = gloves[op.t];
  let skins = old ? without(op.t, old) : loadout.skins;
  if (op.d === 0) delete gloves[op.t];
  else {
    gloves[op.t] = op.d;
    skins = [...skins.filter((x) => !(x.t === op.t && x.d === op.d)), { t: op.t, d: op.d, p: op.p, w: op.w, s: op.s, n: null, st: 0 }];
  }
  return { ...loadout, gloves, skins };
}

/** Название износа по float — как в игре */
export function wearName(w: number): string {
  if (w < 0.07) return "Прямо с завода";
  if (w < 0.15) return "Немного поношенное";
  if (w < 0.38) return "После полевых испытаний";
  if (w < 0.45) return "Поношенное";
  return "Закалённое в боях";
}

// ───────────────────────── каталог (public/skins/catalog.json)

export type CatalogWeapon = { d: number; w: string; name: string; g: "rifle" | "sniper" | "pistol" | "smg" | "heavy" | "knife" | "other"; paints: [number, string][] };
export type CatalogGlove = { d: number; name: string; paints: [number, string, string][] };
export type SkinCatalog = { img: string; weapons: CatalogWeapon[]; gloves: CatalogGlove[] };

export const SKIN_GROUPS: { key: CatalogWeapon["g"]; label: string }[] = [
  { key: "rifle", label: "Винтовки" },
  { key: "sniper", label: "Снайперские" },
  { key: "pistol", label: "Пистолеты" },
  { key: "smg", label: "Пистолеты-пулемёты" },
  { key: "heavy", label: "Тяжёлое" },
  { key: "other", label: "Прочее" },
];
