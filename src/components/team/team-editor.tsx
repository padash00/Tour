"use client";

/* eslint-disable @next/next/no-img-element -- превью локального файла */
import { ImagePlus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { checkTagAvailable } from "@/app/actions/team";
import type { ActionResult, FormAction } from "@/components/forms";
import { Button, Callout, Field, Input, Panel, Textarea, TeamLogo, cn } from "@/components/ds";
import { useToast } from "@/components/toast";
import type { Team } from "@/lib/types";

/*
 * Форма команды (создание и настройки). Ошибки — под полями, не тостом.
 * Тег проверяется при вводе (пауза 400 мс, от 2 символов); главная проверка — на сервере при сохранении.
 */

type Values = { name: string; tag: string; region: string; description: string };
type TagState = "idle" | "checking" | "free" | "taken" | "invalid";

function validate(v: Values) {
  const e: Partial<Record<keyof Values, string>> = {};
  const name = v.name.trim();
  if (name.length < 2) e.name = "Название — минимум 2 символа";
  else if (name.length > 32) e.name = "Название — максимум 32 символа";
  if (!/^[A-Za-z0-9]{2,6}$/.test(v.tag.trim())) e.tag = "Тег — 2–6 латинских букв или цифр";
  if (v.description.length > 400) e.description = "Описание — максимум 400 символов";
  return e;
}

/** Ошибку сервера показываем у своего поля, если она про поле */
function fieldOf(message: string): keyof Values | null {
  const m = message.toLowerCase();
  if (m.includes("тег")) return "tag";
  if (m.includes("назван")) return "name";
  if (m.includes("описан")) return "description";
  return null;
}

export function TeamEditor({ action, team, mode }: { action: FormAction; team?: Team; mode: "create" | "edit" }) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, null);
  const [v, setV] = useState<Values>({ name: team?.name ?? "", tag: team?.tag ?? "", region: team?.region ?? "", description: team?.description ?? "" });
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [tagState, setTagState] = useState<TagState>("idle");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (logo && URL.revokeObjectURL(logo)), [logo]);
  useEffect(() => {
    if (state?.success) toast.success(state.success);
  }, [state, toast]);

  // живая проверка тега
  useEffect(() => {
    const tag = v.tag.trim().toUpperCase();
    if (tag.length < 2 || (team && tag === team.tag.toUpperCase())) return;
    if (!/^[A-Z0-9]{2,6}$/.test(tag)) return;
    let alive = true;
    const t0 = setTimeout(() => alive && setTagState("checking"), 0);
    const t = setTimeout(async () => {
      const r = await checkTagAvailable(tag, team?.id).catch(() => null);
      if (alive) setTagState(r ? (r.ok ? "free" : "taken") : "idle");
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [v.tag, team]);

  const errors = validate(v);
  const serverError = state?.error ?? null;
  const serverField = serverError ? fieldOf(serverError) : null;
  const show = (k: keyof Values) => (touched[k] || submitted ? errors[k] : undefined) ?? (serverField === k ? serverError ?? undefined : undefined);
  const tagUnchanged = !!team && v.tag.trim().toUpperCase() === team.tag.toUpperCase();
  const tagError = show("tag") ?? (tagState === "taken" && !tagUnchanged && v.tag.trim().length >= 2 ? "Тег уже используется" : undefined);
  const set = (k: keyof Values) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: k === "tag" ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/gi, "").slice(0, 6) : e.target.value }));
  const blur = (k: keyof Values) => () => setTouched((x) => ({ ...x, [k]: true }));

  const form = (
    <form
      action={formAction}
      onSubmit={(e) => {
        setSubmitted(true);
        if (Object.keys(errors).length || (tagState === "taken" && !tagUnchanged)) e.preventDefault();
      }}
      noValidate
      className="space-y-6"
    >
      <div className="grid gap-5 sm:grid-cols-[1fr_170px]">
        <Field label="Название" hint="До 32 символов — так команду увидят в сетке" error={show("name")} required>
          {(p) => <Input {...p} name="name" value={v.name} onChange={set("name")} onBlur={blur("name")} maxLength={32} placeholder="Next Level" autoComplete="off" state={show("name") ? "error" : undefined} />}
        </Field>
        <Field
          label="Тег"
          required
          error={tagError}
          checking={!tagError && tagState === "checking" && !tagUnchanged ? "Проверяем…" : undefined}
          success={!tagError && tagState === "free" && !tagUnchanged && v.tag.length >= 2 ? "Тег свободен" : undefined}
          hint="2–6 латинских букв или цифр"
        >
          {(p) => (
            <Input
              {...p}
              name="tag"
              value={v.tag}
              onChange={(e) => {
                set("tag")(e);
                setTagState("idle");
              }}
              onBlur={blur("tag")}
              maxLength={6}
              placeholder="NEXT"
              autoComplete="off"
              className="num uppercase tracking-[0.1em]"
              state={tagError ? "error" : tagState === "free" && !tagUnchanged ? "success" : undefined}
            />
          )}
        </Field>
      </div>
      <Field label="Регион" hint="Город или регион команды">
        {(p) => <Input {...p} name="region" value={v.region} onChange={set("region")} maxLength={48} placeholder="Алматы" />}
      </Field>
      <div>
        <span className="mb-1.5 block text-meta font-medium text-fg-2">Логотип</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Выбрать логотип"
            className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-surface border border-dashed border-line-strong bg-shell transition-colors hover:border-accent/60"
          >
            {logo || team?.logo_url ? <img src={logo ?? team?.logo_url ?? ""} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5 text-fg-3" />}
          </button>
          <div className="min-w-0">
            <button type="button" onClick={() => fileRef.current?.click()} className="text-[14px] font-semibold text-accent hover:text-accent-strong">
              {logo || team?.logo_url ? "Заменить логотип" : "Загрузить логотип"}
            </button>
            <div className="mt-0.5 truncate text-meta text-fg-3">{logoName ?? "PNG, JPG или WEBP до 1 МБ, лучше квадратный"}</div>
          </div>
          <input
            ref={fileRef}
            name="logo"
            type="file"
            aria-label="Логотип команды"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (!f) return;
              setLogoName(`${f.name} · ${Math.max(1, Math.round(f.size / 1024))} КБ`);
              setLogo(URL.createObjectURL(f));
            }}
          />
        </div>
      </div>
      <Field label="Описание" hint={`Необязательно · ${v.description.length}/400`} error={show("description")}>
        {(p) => <Textarea {...p} name="description" rows={3} value={v.description} onChange={set("description")} onBlur={blur("description")} placeholder="Пара слов о команде" />}
      </Field>

      {serverError && !serverField && <Callout tone="danger" title="Не удалось сохранить">{serverError}</Callout>}

      <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-6">
        <Button type="submit" size="lg" loading={pending}>
          {pending ? (mode === "create" ? "Создаём…" : "Сохраняем…") : mode === "create" ? "Создать команду" : "Сохранить"}
        </Button>
        {mode === "create" && <span className="text-meta text-fg-3">Вы станете капитаном команды.</span>}
      </div>
    </form>
  );

  if (mode === "edit") return form;

  // создание: форма + липкое превью
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
      <Panel className="p-5 sm:p-7">{form}</Panel>
      <aside className="lg:sticky lg:top-[calc(var(--shell-h)+24px)]">
        <div className="mb-3 text-meta font-medium text-fg-2">Так команду увидят другие</div>
        <Panel className="p-5">
          <div className="flex items-center gap-4">
            {logo ? <img src={logo} alt="" className="size-14 shrink-0 rounded-surface object-contain" /> : <TeamLogo tag={v.tag || "TAG"} size="lg" />}
            <div className="min-w-0">
              <div className={cn("truncate text-title", v.name.trim() ? "text-fg" : "text-fg-3")}>{v.name.trim() || "Название команды"}</div>
              <div className="num text-meta tracking-[0.1em] text-fg-3">{v.tag || "TAG"}</div>
            </div>
          </div>
          <div className="mt-4 border-t border-line-subtle pt-4 text-meta text-fg-3">{v.region.trim() || "Регион не указан"}</div>
        </Panel>
        <ol className="mt-6 space-y-3 text-meta text-fg-3">
          <li>
            <span className="num mr-2 text-accent">01</span>Вы становитесь капитаном
          </li>
          <li>
            <span className="num mr-2 text-accent">02</span>Приглашаете игроков по ссылке
          </li>
          <li>
            <span className="num mr-2 text-accent">03</span>Подаёте заявку на турнир
          </li>
        </ol>
      </aside>
    </div>
  );
}
