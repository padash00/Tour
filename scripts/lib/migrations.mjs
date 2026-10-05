import { createHash } from "node:crypto";

const literal = (value) => `'${value.replace(/'/g, "''")}'`;
export const checksum = (sql) => createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");

export function migrationPlan(files, applied) {
  const known = new Map(applied.map((row) => [row.name, row.checksum]));
  for (const file of files) {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file.name)) throw new Error(`Invalid migration filename: ${file.name}`);
    const previous = known.get(file.name);
    if (previous && previous !== checksum(file.sql)) throw new Error(`Applied migration changed: ${file.name}`);
  }
  return files.filter((file) => !known.has(file.name));
}

export function migrationTransaction({ name, sql }) {
  return `begin;
    select pg_advisory_xact_lock(16160002);
    create table if not exists public._migrations(name text primary key, applied_at timestamptz not null default now(), checksum text);
    alter table public._migrations add column if not exists checksum text;
    alter table public._migrations enable row level security;
    revoke all on public._migrations from anon, authenticated;
    grant select on public._migrations to service_role;
    do $f16_migration$
    begin
      if not exists(select 1 from public._migrations where name = ${literal(name)}) then
        execute ${literal(sql)};
        insert into public._migrations(name, checksum) values(${literal(name)}, ${literal(checksum(sql))});
      elsif exists(select 1 from public._migrations where name = ${literal(name)} and checksum is not null and checksum <> ${literal(checksum(sql))}) then
        raise exception 'Applied migration checksum mismatch';
      end if;
    end;
    $f16_migration$;
    commit;`;
}
