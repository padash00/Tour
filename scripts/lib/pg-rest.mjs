// Мини-PostgREST поверх PGlite для офлайн-тестов: supabase-js (db() сайта) ходит в fetch, а этот fetch
// переводит запросы /rest/v1/... в SQL. Только то, чем пользуется сайт: выборки со встраиванием связей
// (alias:table!fkey!inner(...)), фильтры (eq/neq/gt/…/in/is/like/cs, not., or/and), order/limit/offset,
// count, single, insert/upsert/update/delete с returning и вызовы функций /rpc/<name>.
// Неподдерживаемое бросает ошибку — тест упадёт, а не получит молча неверный ответ.

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

class RestError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Делит строку по запятым верхнего уровня (вне скобок и кавычек) */
function splitTop(text) {
  const out = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== "\\") quoted = !quoted;
    if (!quoted) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += c;
  }
  if (cur.trim() !== "") out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const unquote = (v) => (v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v);

/** select=… → { star, columns: [{key, column}], embeds: [{key, name, hints, inner, node}] } */
function parseSelect(text) {
  const node = { star: false, columns: [], embeds: [], filters: [], logic: [] };
  for (const item of splitTop(text || "*")) {
    if (item === "*") {
      node.star = true;
      continue;
    }
    const paren = item.indexOf("(");
    if (paren > 0 && item.endsWith(")")) {
      const head = item.slice(0, paren);
      const inner = item.slice(paren + 1, -1);
      const [key, rest] = head.includes(":") ? [head.split(":")[0], head.slice(head.indexOf(":") + 1)] : [null, head];
      const [name, ...hints] = rest.split("!");
      node.embeds.push({
        key: key ?? name,
        name,
        hints: hints.filter((h) => h !== "inner" && h !== "left"),
        inner: hints.includes("inner"),
        node: parseSelect(inner),
      });
      continue;
    }
    const [key, column] = item.includes(":") ? [item.split(":")[0], item.slice(item.indexOf(":") + 1)] : [item, item];
    if (/[^\w]/.test(column)) throw new RestError(400, "PGRST100", `unsupported select item: ${item}`);
    node.columns.push({ key, column });
  }
  return node;
}

/** «op.value» / «not.op.value» → { not, op, value } */
function parseOperator(text) {
  let not = false;
  let rest = text;
  if (rest.startsWith("not.")) {
    not = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  if (dot < 0) throw new RestError(400, "PGRST100", `bad filter: ${text}`);
  return { not, op: rest.slice(0, dot), value: rest.slice(dot + 1) };
}

/** Элементы or=(…)/and=(…) → дерево условий */
function parseLogic(kind, body, not = false) {
  const items = splitTop(body).map((item) => {
    const m = /^(not\.)?(and|or)\((.*)\)$/s.exec(item);
    if (m) return parseLogic(m[2], m[3], !!m[1]);
    const dot = item.indexOf(".");
    return { column: item.slice(0, dot), ...parseOperator(item.slice(dot + 1)) };
  });
  return { kind, not, items };
}

export function createPgRest(sql, { base = "http://127.0.0.1:9" } = {}) {
  let schema = null;
  let aliasSeq = 0;

  async function loadSchema() {
    if (schema) return schema;
    const tables = new Map();
    const cols = await sql.query(`select c.relname as table, a.attname as column, format_type(a.atttypid, a.atttypmod) as type
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'p') and a.attnum > 0 and not a.attisdropped order by a.attnum`);
    for (const r of cols.rows) {
      if (!tables.has(r.table)) tables.set(r.table, { columns: new Map(), unique: [], pk: null });
      tables.get(r.table).columns.set(r.column, r.type);
    }
    const idx = await sql.query(`select c.relname as table, i.indisprimary as pk,
        array(select a.attname from unnest(i.indkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum order by k.ord) as columns
      from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and i.indisunique and i.indpred is null`);
    for (const r of idx.rows) {
      const t = tables.get(r.table);
      if (!t) continue;
      t.unique.push(r.columns);
      if (r.pk) t.pk = r.columns;
    }
    const fks = (await sql.query(`select con.conname as name, src.relname as "from", dst.relname as "to",
        array(select a.attname from unnest(con.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as from_columns,
        array(select a.attname from unnest(con.confkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum order by k.ord) as to_columns
      from pg_constraint con join pg_class src on src.oid = con.conrelid join pg_class dst on dst.oid = con.confrelid
      join pg_namespace n on n.oid = src.relnamespace where con.contype = 'f' and n.nspname = 'public'`)).rows;
    const fns = new Map();
    const procs = await sql.query(`select p.proname as name, p.proretset as set, format_type(p.prorettype, null) as returns,
        coalesce(p.proargnames, '{}') as arg_names, array(select format_type(t, null) from unnest(p.proargtypes) t) as arg_types
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
    for (const r of procs.rows) fns.set(r.name, r);
    schema = { tables, fks, fns };
    return schema;
  }

  const table = (name) => {
    const t = schema.tables.get(name);
    if (!t) throw new RestError(404, "PGRST205", `Could not find the table 'public.${name}' in the schema cache`);
    return t;
  };

  /** Связь parent → embed: many-to-one (объект) или one-to-many (массив); как PostgREST — с подсказкой !fkey/!column */
  function relation(parent, embed) {
    const target = embed.name;
    table(target);
    let candidates = [
      ...schema.fks.filter((f) => f.from === parent && f.to === target).map((f) => ({ f, many: false, pairs: f.from_columns.map((c, i) => [c, f.to_columns[i]]) })),
      ...schema.fks.filter((f) => f.to === parent && f.from === target).map((f) => {
        const unique = table(target).unique.some((u) => u.length === f.from_columns.length && u.every((c) => f.from_columns.includes(c)));
        return { f, many: !unique, pairs: f.to_columns.map((c, i) => [c, f.from_columns[i]]) };
      }),
    ];
    // самоссылки (matches.winner_to_match) в обе стороны: оставляем many-to-one, как и PostgREST по умолчанию
    if (parent === target) candidates = candidates.filter((c) => !c.many);
    for (const hint of embed.hints) {
      candidates = candidates.filter((c) => c.f.name === hint || (c.f.from_columns.length === 1 && c.f.from_columns[0] === hint));
    }
    if (candidates.length !== 1) {
      throw new RestError(300, "PGRST201", `Could not embed '${target}' into '${parent}': ${candidates.length} relationships (hints: ${embed.hints.join(",") || "none"})`);
    }
    return candidates[0];
  }

  /** Условие одного фильтра для столбца alias.column */
  function condition(alias, tbl, f, params) {
    if (!table(tbl).columns.has(f.column)) throw new RestError(400, "42703", `column ${tbl}.${f.column} does not exist`);
    const col = `${alias}.${q(f.column)}`;
    const p = (v) => {
      params.push(v);
      return `$${params.length}`;
    };
    let expr;
    const value = unquote(f.value);
    switch (f.op) {
      case "eq": expr = `${col} = ${p(value)}`; break;
      case "neq": expr = `${col} <> ${p(value)}`; break;
      case "gt": expr = `${col} > ${p(value)}`; break;
      case "gte": expr = `${col} >= ${p(value)}`; break;
      case "lt": expr = `${col} < ${p(value)}`; break;
      case "lte": expr = `${col} <= ${p(value)}`; break;
      case "like": expr = `${col}::text like ${p(value.replace(/\*/g, "%"))}`; break;
      case "ilike": expr = `${col}::text ilike ${p(value.replace(/\*/g, "%"))}`; break;
      case "is": {
        const v = value.toLowerCase();
        if (!["null", "true", "false", "unknown"].includes(v)) throw new RestError(400, "PGRST100", `bad is value: ${value}`);
        expr = `${col} is ${v}`;
        break;
      }
      case "isdistinct": expr = `${col} is distinct from ${p(value)}`; break;
      case "in": {
        const m = /^\((.*)\)$/s.exec(f.value);
        if (!m) throw new RestError(400, "PGRST100", `bad in list: ${f.value}`);
        const list = splitTop(m[1]).map(unquote);
        expr = list.length ? `${col} in (${list.map(p).join(", ")})` : "false";
        break;
      }
      case "cs": expr = `${col} @> ${p(value)}`; break;
      case "cd": expr = `${col} <@ ${p(value)}`; break;
      case "ov": expr = `${col} && ${p(value)}`; break;
      default: throw new RestError(400, "PGRST100", `unsupported operator ${f.op}`);
    }
    return f.not ? `not (${expr})` : expr;
  }

  function logicCondition(alias, tbl, tree, params) {
    const parts = tree.items.map((i) => ("kind" in i ? logicCondition(alias, tbl, i, params) : condition(alias, tbl, i, params)));
    const joined = parts.length ? `(${parts.join(tree.kind === "and" ? " and " : " or ")})` : "true";
    return tree.not ? `not ${joined}` : joined;
  }

  /** Условия узла (свои фильтры + !inner у встроенных) для строки alias */
  function nodeWhere(node, tbl, alias, params) {
    const conds = node.filters.map((f) => condition(alias, tbl, f, params));
    for (const tree of node.logic) conds.push(logicCondition(alias, tbl, tree, params));
    for (const e of node.embeds) {
      if (!e.inner) continue;
      const expr = embedExpr(e, tbl, alias, params);
      conds.push(e.rel.many ? `jsonb_array_length(${expr}) > 0` : `${expr} is not null`);
    }
    return conds;
  }

  function embedExpr(e, parentTable, parentAlias, params) {
    e.rel ??= relation(parentTable, e);
    const alias = `e${++aliasSeq}`;
    const join = e.rel.pairs.map(([p, c]) => `${alias}.${q(c)} = ${parentAlias}.${q(p)}`);
    const where = [...join, ...nodeWhere(e.node, e.name, alias, params)].join(" and ");
    const json = nodeJson(e.node, e.name, alias, params);
    return e.rel.many
      ? `coalesce((select jsonb_agg(${json}) from public.${q(e.name)} ${alias} where ${where}), '[]'::jsonb)`
      : `(select ${json} from public.${q(e.name)} ${alias} where ${where} limit 1)`;
  }

  function nodeJson(node, tbl, alias, params) {
    const t = table(tbl);
    for (const c of node.columns) if (!t.columns.has(c.column)) throw new RestError(400, "42703", `column ${tbl}.${c.column} does not exist`);
    const parts = [];
    if (node.star) parts.push(`to_jsonb(${alias})`);
    const pairs = node.columns.map((c) => `'${c.key}', ${alias}.${q(c.column)}`);
    for (const e of node.embeds) pairs.push(`'${e.key}', ${embedExpr(e, tbl, alias, params)}`);
    for (let i = 0; i < pairs.length; i += 40) parts.push(`jsonb_build_object(${pairs.slice(i, i + 40).join(", ")})`);
    return parts.length ? parts.join(" || ") : "'{}'::jsonb";
  }

  /** Фильтры из query: путь «a.b.col» уходит во встроенный узел a → b */
  function attachFilters(root, params) {
    const reserved = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
    for (const [key, value] of params) {
      if (reserved.has(key)) continue;
      const path = key.split(".");
      const last = path.pop();
      let node = root;
      for (const step of path) {
        const e = node.embeds.find((x) => x.key === step || x.name === step);
        if (!e) throw new RestError(400, "PGRST108", `'${step}' is not an embedded resource in this request`);
        node = e.node;
      }
      if (last === "or" || last === "and") {
        const m = /^\((.*)\)$/s.exec(value);
        if (!m) throw new RestError(400, "PGRST100", `bad logic tree: ${value}`);
        node.logic.push(parseLogic(last, m[1]));
      } else node.filters.push({ column: last, ...parseOperator(value) });
    }
  }

  function orderBy(text, tbl) {
    if (!text) return "";
    const parts = text.split(",").map((part) => {
      const [column, ...mods] = part.split(".");
      if (!table(tbl).columns.has(column)) throw new RestError(400, "42703", `order column ${tbl}.${column} does not exist`);
      const dir = mods.includes("desc") ? "desc" : "asc";
      const nulls = mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : "";
      return `t0.${q(column)} ${dir}${nulls}`;
    });
    return ` order by ${parts.join(", ")}`;
  }

  async function select(tbl, url, headers, head) {
    const root = parseSelect(url.searchParams.get("select") ?? "*");
    attachFilters(root, url.searchParams);
    const params = [];
    const where = nodeWhere(root, tbl, "t0", params);
    const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const json = nodeJson(root, tbl, "t0", params);
    const rows = head
      ? []
      : (await sql.query(`select ${json} as j from public.${q(tbl)} t0${whereSql}${orderBy(url.searchParams.get("order"), tbl)}${limit ? ` limit ${Number(limit)}` : ""}${offset ? ` offset ${Number(offset)}` : ""}`, params)).rows.map((r) => r.j);
    let count = null;
    if (/count=(exact|planned|estimated)/.test(headers.get("prefer") ?? "")) {
      const countParams = [];
      const countWhere = nodeWhere(root, tbl, "t0", countParams);
      count = Number((await sql.query(`select count(*)::int as n from public.${q(tbl)} t0${countWhere.length ? ` where ${countWhere.join(" and ")}` : ""}`, countParams)).rows[0].n);
    }
    return { rows, count };
  }

  /** Строки insert/upsert: каждая — отдельным оператором в общей транзакции (missing=default — свои столбцы) */
  async function write(method, tbl, url, headers, body) {
    const t = table(tbl);
    const prefer = headers.get("prefer") ?? "";
    const root = parseSelect(url.searchParams.get("select") ?? "*");
    const returning = /return=representation/.test(prefer);
    const out = [];
    await sql.transaction(async (tx) => {
      const run = async (statement, params) => {
        const p = [...params];
        const json = nodeJson(root, tbl, "m", p);
        const res = await tx.query(`with m as (${statement} returning t0.*) select ${json} as j from m`, p);
        out.push(...res.rows.map((r) => r.j));
      };
      if (method === "POST") {
        const rows = Array.isArray(body) ? body : [body];
        const listed = url.searchParams.get("columns")?.split(",").map((c) => c.replace(/"/g, "").trim());
        const missingDefault = /missing=default/.test(prefer);
        const resolution = /resolution=merge-duplicates/.test(prefer) ? "merge" : /resolution=ignore-duplicates/.test(prefer) ? "ignore" : null;
        const conflict = url.searchParams.get("on_conflict")?.split(",").map((c) => c.trim()) ?? t.pk;
        for (const row of rows) {
          const cols = (listed && !missingDefault ? listed : Object.keys(row).filter((k) => !listed || listed.includes(k))).filter((c) => row[c] !== undefined || !missingDefault);
          for (const c of cols) if (!t.columns.has(c)) throw new RestError(400, "PGRST204", `Could not find the '${c}' column of '${tbl}' in the schema cache`);
          let statement = cols.length
            ? `insert into public.${q(tbl)} as t0 (${cols.map(q).join(", ")}) select ${cols.map((c) => `r.${q(c)}`).join(", ")} from jsonb_populate_record(null::public.${q(tbl)}, $1::jsonb) r`
            : `insert into public.${q(tbl)} as t0 default values`;
          if (resolution) {
            const update = cols.filter((c) => !conflict.includes(c));
            statement += ` on conflict (${conflict.map(q).join(", ")}) do ${resolution === "ignore" || !update.length ? "nothing" : `update set ${update.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}`}`;
          }
          await run(statement, cols.length ? [JSON.stringify(row)] : []);
        }
      } else if (method === "PATCH") {
        const cols = Object.keys(body ?? {}).filter((c) => body[c] !== undefined);
        for (const c of cols) if (!t.columns.has(c)) throw new RestError(400, "PGRST204", `Could not find the '${c}' column of '${tbl}' in the schema cache`);
        if (!cols.length) return;
        const filterRoot = parseSelect("*");
        attachFilters(filterRoot, url.searchParams);
        const params = [JSON.stringify(body)];
        const where = nodeWhere(filterRoot, tbl, "t0", params);
        await run(`update public.${q(tbl)} t0 set ${cols.map((c) => `${q(c)} = r.${q(c)}`).join(", ")} from jsonb_populate_record(null::public.${q(tbl)}, $1::jsonb) r${where.length ? ` where ${where.join(" and ")}` : ""}`, params);
      } else if (method === "DELETE") {
        const filterRoot = parseSelect("*");
        attachFilters(filterRoot, url.searchParams);
        const params = [];
        const where = nodeWhere(filterRoot, tbl, "t0", params);
        await run(`delete from public.${q(tbl)} t0${where.length ? ` where ${where.join(" and ")}` : ""}`, params);
      }
    });
    return { rows: returning ? out : null, affected: out.length };
  }

  /** Значение аргумента функции → текст для приведения $n::тип */
  function argText(value, type) {
    if (value === null || value === undefined) return null;
    if (type.endsWith("[]")) {
      if (!Array.isArray(value)) return String(value);
      return `{${value.map((v) => (v === null ? "NULL" : `"${String(v).replace(/["\\]/g, (c) => `\\${c}`)}"`)).join(",")}}`;
    }
    if (type === "jsonb" || type === "json") return JSON.stringify(value);
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }

  async function rpc(name, args) {
    const fn = schema.fns.get(name);
    if (!fn) throw new RestError(404, "PGRST202", `Could not find the function public.${name} in the schema cache`);
    const params = [];
    const named = Object.entries(args ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        const i = fn.arg_names.indexOf(k);
        if (i < 0) throw new RestError(404, "PGRST202", `function public.${name} has no argument ${k}`);
        params.push(argText(v, fn.arg_types[i]));
        return `${q(k)} => $${params.length}::${fn.arg_types[i]}`;
      });
    const call = `public.${q(name)}(${named.join(", ")})`;
    if (fn.set) return (await sql.query(`select to_jsonb(r) as j from ${call} r`, params)).rows.map((r) => r.j);
    if (fn.returns === "void") {
      await sql.query(`select ${call}`, params);
      return null;
    }
    return (await sql.query(`select to_jsonb(${call}) as j`, params)).rows[0].j;
  }

  const json = (status, data, extra = {}) =>
    new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "content-type": "application/json", ...extra } });

  return async function pgRestFetch(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.origin !== new URL(base).origin || !url.pathname.startsWith("/rest/v1/")) {
      throw new Error(`offline test: unexpected request ${url.href}`);
    }
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const path = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
    try {
      await loadSchema();
      if (path.startsWith("rpc/")) return json(200, await rpc(path.slice(4), body));
      if (method === "GET" || method === "HEAD") {
        const { rows, count } = await select(path, url, headers, method === "HEAD");
        const range = count == null ? {} : { "content-range": `${rows.length ? `0-${rows.length - 1}` : "*"}/${count}` };
        if (method === "HEAD") return new Response(null, { status: 200, headers: range });
        if ((headers.get("accept") ?? "").includes("vnd.pgrst.object")) {
          if (rows.length !== 1) {
            return json(406, { code: "PGRST116", message: "Cannot coerce the result to a single JSON object", details: `The result contains ${rows.length} rows`, hint: null });
          }
          return json(200, rows[0], range);
        }
        return json(200, rows, range);
      }
      if (["POST", "PATCH", "DELETE"].includes(method)) {
        const { rows, affected } = await write(method, path, url, headers, body);
        const range = /count=exact/.test(headers.get("prefer") ?? "") ? { "content-range": `*/${affected}` } : {};
        if (rows === null) return new Response(null, { status: method === "POST" ? 201 : 204, headers: range });
        if ((headers.get("accept") ?? "").includes("vnd.pgrst.object")) {
          if (rows.length !== 1) return json(406, { code: "PGRST116", message: "Cannot coerce the result to a single JSON object", details: `The result contains ${rows.length} rows`, hint: null });
          return json(method === "POST" ? 201 : 200, rows[0], range);
        }
        return json(method === "POST" ? 201 : 200, rows, range);
      }
      throw new RestError(405, "PGRST117", `Unsupported method ${method}`);
    } catch (e) {
      if (e instanceof RestError) return json(e.status, { code: e.code, message: e.message, details: e.details, hint: null });
      // ошибки PostgreSQL — как у PostgREST: 409 для уникальности/ссылок, иначе 400
      const status = e.code === "23505" || e.code === "23503" ? 409 : e.code === "P0001" ? 400 : 400;
      return json(status, { code: e.code ?? "XX000", message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
    }
  };
}
