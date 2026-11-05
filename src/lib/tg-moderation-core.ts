/**
 * Модерация общего Telegram-чата — чистая логика без сети и базы (тест: scripts/test-tg-moderation.mts).
 *  - мат (русский, казахский, частично английский), в том числе с маскировкой: латиница вместо кириллицы,
 *    цифры вместо букв, «х*й», «х.у.й», «х у й»;
 *  - оскорбления;
 *  - чужие ссылки (реклама): всё, кроме сайта клуба, Steam, FACEIT и трансляций;
 *  - лестница наказаний по числу предупреждений за 30 дней.
 */

export type Violation = { kind: "mat" | "insult" | "link"; reason: string; match: string };

// латиница и цифры, похожие на кириллицу
const LOOKALIKE: Record<string, string> = {
  a: "а", b: "б", c: "с", e: "е", h: "н", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у", u: "и", i: "и", n: "п", r: "г",
  "0": "о", "1": "и", "3": "з", "4": "ч", "6": "б", "@": "а", $: "с", "!": "и", "|": "и", ё: "е",
};
// чисто латинское слово, которое выглядит как кириллица («cyka», «xyй», «x y й»): только буквы, неотличимые на глаз.
// b, i, u, n, r сюда не входят — иначе «ebay», «bitch» и обычные английские слова стали бы «матом»
const VISUAL: Record<string, string> = { a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у", k: "к", m: "м", t: "т", h: "н", "3": "з", "0": "о", "6": "б" };
// маска вместо буквы: «х*й», «п#зда» — подставляем гласные
const MASK = /[*#%@!?]/;
const MASK_ALL = /[*#%@!?]/g;
// чем заполнять маску: гласные и буквы, которые чаще всего прячут («б**ть», «е*ать», «пи*да»)
const MASK_FILL = ["у", "и", "а", "е", "о", "я", "ы", "л", "б", "з", "д"];

/** Слово → кириллица без маскировки: «Xуй», «х*й», «п1зда» → «хуй», «хй»… (звёздочка выпадает) */
export function normalizeWord(w: string, keepMask = false) {
  let s = w.toLowerCase().replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g, ""); // невидимые символы внутри слова
  // латиница → кириллица только в словах, где уже есть кириллица («xуй», «пiзда»); чисто латинские слова
  // («ebay», «home») не трогаем — их проверяет MAT_TRANSLIT; исключение — слова только из «одинаковых на глаз» букв («cyka»)
  if (/[а-яёәіңғүұқөһ]/.test(s)) s = [...s].map((ch) => (keepMask && MASK.test(ch) ? ch : LOOKALIKE[ch] ?? ch)).join("");
  else if (/^[a-z0-9]+$/.test(s) && [...s].every((ch) => VISUAL[ch])) s = [...s].map((ch) => VISUAL[ch]).join("");
  // буквы кириллицы (в т. ч. казахские) — остальное (., -, _ и т. п.) выбрасываем
  s = s.replace(keepMask ? /[^а-яәіңғүұқөһ*#%@!?]/g : /[^а-яәіңғүұқөһ]/g, "");
  // «хууууй», «ссука» → «хуй», «сука» (для поиска корней удвоенные буквы не важны)
  return s.replace(/([^*#%@!?])\1+/g, "$1");
}

/** Слова сообщения, плюс «склейка» подряд идущих одиночных букв: «х у й» → «хуй» */
// короткие настоящие слова — их с соседним словом не склеиваем («и бал», «на хату»)
const SHORT_WORDS = new Set(["и", "а", "о", "у", "в", "к", "с", "я", "ж", "на", "по", "за", "до", "от", "не", "ни", "но", "он", "мы", "вы", "ты", "их", "ее", "её", "то", "же", "ли", "бы", "из", "об", "во", "со", "ко", "да", "ну", "ой", "ах", "эх", "уж", "им", "ей", "ох", "ай", "ок", "го", "ща", "че", "чё", "мб", "кд", "тт", "ии", "ау"]);

export function words(text: string): string[] {
  // «!», «?» внутри слова — маскировка («п!зда»), режем только по пробелам и знакам между словами
  const raw = text.split(/[\s,;:()"«»]+|[!?.]+(?=\s|$)/).filter(Boolean);
  const out: string[] = [];
  const norm = raw.map((r) => normalizeWord(r));
  for (let k = 0; k + 1 < norm.length; k++) {
    const a = norm[k], b = norm[k + 1];
    if (a && b && a.length <= 2 && !SHORT_WORDS.has(a) && b.length >= 2) out.push(a + b);
  }
  let glue = "";
  for (const r of raw) {
    const w = normalizeWord(r);
    if (w.length === 1) {
      glue += w;
      continue;
    }
    if (glue.length >= 3) out.push(glue);
    glue = "";
    // «х.у.й» / «х-у-й» внутри одного токена уже склеилось в normalizeWord
    if (w) out.push(w);
  }
  if (glue.length >= 3) out.push(glue);
  return out;
}

// корни мата. «еб» — только в начале слова или после приставки, чтобы не ловить «себе», «требовать», «небо»
const MAT: RegExp[] = [
  /^(?:вы|за|у|по|на|до|от|раз|рас|съ|при|про|об|под|пере|недо|наи|изъ|въ|отъ|объ|подъ|разъ|взъ|долбо|долба|мудо)?[её]б(?:а|у|л|н|ы|и|о|е|т|ш|к|ч|с|ь|ё|$)/,
  /^(?:за|у|вы|от|на|по|раз)?[иы]б(?:ал|ат|ан|ут|ёт|уч|ну)/,
  /^й[оё]б/,
  /^[её]пт/,
  /^[её]б$/,
  /^(?:на|по|за|от|до|ни|о|а|пере|при|рас|раз|об)?х[уи][йеёияю]/,
  /^хули$/,
  /п[иеёы][зс]д/,
  /^пзд/,
  /^(?:вы|по|на|за|раз|до)?бля/,
  /^бл(?:э|еа|иа)[дт]/,
  /^(?:нах|пох|нахер|похер|нахрен|похрен)$/,
  /^су(?:ка|ки|ке|ку|кой|чк|чар|чь)/,
  /^с(?:цу|ю)к(?:а|и|е|у|ой)$/,
  /^муд(?:а|ак|ил|о)/,
  /^(?:вы|за)?пид[оа]?р/,
  /^залуп/,
  /^(?:гандон|гондон)/,
  /^шлюх/,
  /^дроч/,
  /^манд(?:а|ы|е|у|ой|ень)$/,
  // казахский
  /^с[іи]г(?:ей|ем|ім|им|іп|ип)/,
  /^с[іы]к(?:ім|им|тір|тир)?$/,
  /^(?:[қк]отақ|котак)/,
  /^ам(?:ың|ын)/,
  /^ана(?:ң|н)ды/,
  /^ене(?:ң|н)д[іи]/,
  /жез[өо]кше/,
];
// английский — по исходному (латинскому) тексту
// мат транслитом: «blyat», «pizda», «nahui», «suka»
const MAT_TRANSLIT = /\b(?:pizd\w*|p1zd\w*|bly[ae]\w*|bl[iy]at\w*|suk[ai]\b|suchk\w*|x[uy][iy]\w*|h[uy][iy]\b|huy\w*|hu[ie]v\w*|nah[uy][iy]\w*|eba[tl]\w*|eban\w*|ebl[ao]\w*|zaeb\w*|pid[ao]?r\w*|mudak\w*|mudil\w*|zalup\w*|gand[oa]n\w*|sig[ei]y[ei]n\w*)/i;
const MAT_EN = /\b(?:f+[u*#@_]*c+k+\w*|f[*#@]+k\w*|sh[i1]t\w*|b[i1]tch\w*|cunt\w*|n[i1]gg(?:er|a)\w*|wh[o0]re\w*)\b/i;

const INSULT: RegExp[] = [/^дебил/, /^даун(?:ы|а|у|ом)?$/, /^идиот/, /^чмо/, /^лох(?:и|а|у|ом)?$/, /^ублюд/, /^мраз/, /^твар[ьи]$/, /^гнид/, /^конч[еа]нн?(?:ый|ая|ое|ые|ого|ому|ой|ым|ых|ую|ыми)$/, /^уеб/];

const ALLOWED_HOSTS = ["f16-arena.kz", "steamcommunity.com", "store.steampowered.com", "faceit.com", "youtube.com", "youtu.be", "twitch.tv", "kick.com"];
const OWN_TME = ["f16arena_cs2"];

/** Варианты слова с маской: «х*й» → «хуй», «хий», «хай»… */
function unmask(raw: string): string[] {
  const w = normalizeWord(raw, true);
  if (!MASK.test(w) || w.replace(MASK_ALL, "").length < 2) return [];
  let out = [w];
  for (let i = 0; i < 2 && out.some((x) => MASK.test(x)); i++) out = out.flatMap((x) => (MASK.test(x) ? MASK_FILL.map((f) => x.replace(MASK, f)) : [x]));
  return out.filter((x) => !MASK.test(x));
}

export function findViolation(text: string): Violation | null {
  if (!text) return null;
  for (const w of words(text)) {
    if (MAT.some((re) => re.test(w))) return { kind: "mat", reason: "мат в чате запрещён", match: w };
  }
  for (const raw of text.split(/\s+/)) {
    if (unmask(raw).some((v) => MAT.some((re) => re.test(v)))) return { kind: "mat", reason: "мат в чате запрещён", match: raw };
  }
  const tr = MAT_TRANSLIT.exec(text);
  if (tr) return { kind: "mat", reason: "мат в чате запрещён", match: tr[0] };
  const en = MAT_EN.exec(text);
  if (en) return { kind: "mat", reason: "мат в чате запрещён", match: en[0] };
  for (const w of words(text)) {
    if (INSULT.some((re) => re.test(w))) return { kind: "insult", reason: "оскорбления запрещены", match: w };
  }
  const link = foreignLink(text);
  if (link) return { kind: "link", reason: "реклама и чужие ссылки запрещены", match: link };
  return null;
}

/** Первая ссылка не на разрешённые сайты; t.me — только наш чат */
export function foreignLink(text: string): string | null {
  const re = /\b((?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s]*)?)/gi;
  for (const m of text.matchAll(re)) {
    const host = m[2].toLowerCase();
    const path = (m[3] ?? "").toLowerCase();
    // обычные слова с точкой («т.е.», «и.т.д») сюда не попадут — нужна латинская зона
    if (host === "t.me" || host === "telegram.me" || host.endsWith(".t.me")) {
      const name = path.split(/[/?#]/)[1] ?? "";
      if (OWN_TME.includes(name)) continue;
      return m[1];
    }
    if (ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) continue;
    if (!/\.(?:com|ru|kz|net|org|io|me|gg|xyz|top|site|online|shop|pro|info|biz|cc|ly|link|club|app|store|live|tv)$/.test(host)) continue;
    return m[1];
  }
  return null;
}

export type Punishment = { action: "warn" | "mute" | "ban"; seconds?: number; label: string };

/** Что делать на n-м предупреждении за 30 дней (n с 1) */
export function punishmentFor(n: number): Punishment {
  if (n <= 2) return { action: "warn", label: "предупреждение" };
  if (n === 3) return { action: "mute", seconds: 3600, label: "мут на 1 час" };
  if (n === 4) return { action: "mute", seconds: 86_400, label: "мут на 24 часа" };
  return { action: "ban", label: "бан" };
}

/** «30m», «2h», «1d», «90» (минуты) → секунды; null — не понял */
export function parseDuration(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,4})\s*(m|min|м|мин|h|ч|d|д)?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "m").toLowerCase();
  const sec = unit.startsWith("h") || unit === "ч" ? n * 3600 : unit.startsWith("d") || unit === "д" ? n * 86_400 : n * 60;
  return sec >= 30 && sec <= 366 * 86_400 ? sec : null;
}

export function formatDuration(sec: number) {
  if (sec % 86_400 === 0) return `${sec / 86_400} д`;
  if (sec % 3600 === 0) return `${sec / 3600} ч`;
  return `${Math.round(sec / 60)} мин`;
}
