"use client";

import { useRouter } from "next/navigation";
import { Globe2, LockKeyhole, Trophy } from "lucide-react";
import { useState, useTransition } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView, ViewMember } from "@/lib/lobby-view";
import { potBank } from "@/lib/lobby-settings";
import { TIERS, TIER_COLOR, tierRange, type TierKey } from "@/lib/tiers";
import { Button, Dialog, Field, Input, cn } from "@/components/ds";
import { useT } from "@/lib/i18n/client";
import { tr } from "@/lib/i18n/core";
import { useToast } from "../toast";
import { Icon } from "./ui";
import type { Run } from "./use-lobby-view";

/*
 * «Десятка» — игра 5 на 5 на банк между игроками: создание, плашка тира, панель банка и отметки взносов.
 * Деньги сайт не принимает: взносы игроки передают организатору сами, здесь только его отметки.
 */

export const money = (n: number) => n.toLocaleString("ru-RU");

export function TierBadge({ tier, className }: { tier: TierKey; className?: string }) {
  const t = useT();
  return (
    <span
      className={cn("num inline-grid h-5 min-w-5 place-items-center rounded-[5px] border px-1 text-[11px] font-bold leading-none", className)}
      style={{ borderColor: TIER_COLOR[tier], color: TIER_COLOR[tier] }}
      title={t("Тир {tier}: {range} ELO", { tier, range: tierRange(tier, t("ур.")) })}
    >
      {tier}
    </span>
  );
}

const FEE_DEFAULT = 5000;

export function CreatePotButton({ loggedIn, className }: { loggedIn: boolean; className?: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<TierKey[]>([...TIERS]);
  const [fee, setFee] = useState(String(FEE_DEFAULT));
  const [closed, setClosed] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  const feeNum = Math.max(0, Math.round(Number(fee) || 0));
  const bank = feeNum * 10;
  const toggle = (tier: TierKey) => setTiers((cur) => (cur.includes(tier) ? cur.filter((x) => x !== tier) : TIERS.filter((x) => x === tier || cur.includes(x))));

  const submit = () =>
    start(async () => {
      const r = await A.createPot(tiers, feeNum, closed ? "closed" : "public", password);
      if (r?.error) {
        toast.error(r.error);
        if (r.code) router.push(`/lobby/${r.code}`);
        return;
      }
      if (r?.code) {
        setOpen(false);
        router.push(`/lobby/${r.code}`);
      }
    });

  const trigger = () => {
    if (!loggedIn) return router.push(`/login?next=${encodeURIComponent("/lobbies")}`);
    setOpen(true);
  };

  return (
    <>
      <Button variant="secondary" onClick={trigger} icon={<Trophy />} className={className}>
        {t("Собрать десятку")}
      </Button>

      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={t("Собрать десятку")}
        description={t("Игра 5 на 5 на банк между игроками: BO3 через интернет. Капитаны — двое с самым высоким ELO, игроков выбирают змейкой.")}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("Отмена")}
            </Button>
            <Button onClick={submit} loading={pending} disabled={tiers.length === 0 || (closed && password.trim().length < 4)} data-autofocus>
              {t("Собрать десятку")}
            </Button>
          </>
        }
      >
        <div className="text-[14px] font-semibold text-fg">{t("Кто может играть")}</div>
        <p className="mt-1 text-meta text-fg-3">{t("Тир считается по FACEIT ELO. Игрок вне выбранных тиров в игру не попадёт — только наблюдателем.")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TIERS.map((tier) => {
            const on = tiers.includes(tier);
            return (
              <button
                key={tier}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(tier)}
                className={cn(
                  "rounded-control border px-3 py-2.5 text-left transition-[border-color,background-color]",
                  on ? "border-accent/45 bg-accent-dim" : "border-line-subtle bg-surface opacity-60 hover:opacity-100",
                )}
              >
                <span className="num block text-[18px] font-bold leading-none" style={{ color: TIER_COLOR[tier] }}>
                  {tier}
                </span>
                <span className="num mt-1.5 block text-micro text-fg-3">{tierRange(tier, t("ур."))}</span>
              </button>
            );
          })}
        </div>

        <Field
          className="mt-5"
          label={t("Взнос с игрока, тг")}
          hint={bank > 0 ? t("Банк на 10 игроков: {sum} тг. Как его делить, решаете вы — обычно всё победившей команде.", { sum: money(bank) }) : t("Без взноса — играете на интерес.")}
        >
          {(field) => (
            <Input {...field} type="number" inputMode="numeric" min={0} max={1000000} step={500} value={fee} onChange={(e) => setFee(e.target.value)} />
          )}
        </Field>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {(
            [
              [false, <Globe2 key="i" />, tr("Открытая"), tr("Видна в списке, зайти может любой с подходящим тиром.")],
              [true, <LockKeyhole key="i" />, tr("По паролю"), tr("Видна в списке, вход по паролю или ссылке-приглашению.")],
            ] as const
          ).map(([value, icon, title, text]) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={closed === value}
              onClick={() => setClosed(value)}
              className={cn(
                "grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-control border p-3 text-left transition-[border-color,background-color]",
                closed === value ? "border-accent/45 bg-accent-dim" : "border-line-subtle bg-surface hover:border-line-strong",
              )}
            >
              <span className={cn("grid size-8 place-items-center rounded-control [&>svg]:size-4", closed === value ? "bg-accent text-accent-ink" : "bg-surface-3 text-fg-3")}>{icon}</span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-fg">{t(title)}</span>
                <span className="mt-0.5 block text-meta text-fg-2">{t(text)}</span>
              </span>
            </button>
          ))}
        </div>
        {closed && (
          <Field className="mt-3" label={t("Пароль")} required hint={t("От 4 до 32 символов.")}>
            {(field) => <Input {...field} type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} maxLength={32} autoComplete="off" />}
          </Field>
        )}

        <div className="mt-5 rounded-control border border-line-subtle bg-shell px-4 py-3 text-meta leading-relaxed text-fg-3">{t(POT_DISCLAIMER)}</div>
      </Dialog>
    </>
  );
}

const POT_DISCLAIMER = tr(
  "Взносы игроки передают организатору сами. F16 Arena только даёт сервер и страницу игры: денег не принимает, не хранит и за расчёты между игроками не отвечает.",
);

/** Панель «Десятки» в комнате: тиры, взнос, банк, сколько взносов отмечено */
export function PotPanel({ view }: { view: LobbyView }) {
  const t = useT();
  const s = view.lobby.settings;
  if (!s.pot) return null;
  const bank = potBank(s);
  const players = view.members.filter((m) => m.slot !== "spec");
  const paid = players.filter((m) => m.paid).length;
  const need = s.team_size * 2;
  return (
    <section aria-label={t("Десятка")} className="rounded-surface border border-accent/30 bg-accent-dim/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">{t("Десятка")}</div>
        <div className="flex gap-1">
          {s.pot_tiers.map((tier) => (
            <TierBadge key={tier} tier={tier} />
          ))}
        </div>
      </div>
      {bank > 0 ? (
        <>
          <div className="num mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg">
            {money(bank)} <span className="text-[15px] font-medium text-fg-3">{t("тг")}</span>
          </div>
          <div className="mt-1.5 text-meta text-fg-2">{t("Банк · взнос {fee} тг с игрока", { fee: money(s.pot_fee) })}</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
              <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${Math.min(100, (paid / need) * 100)}%` }} />
            </div>
            <span className="num text-meta text-fg-2">{t("взносы {n}/{total}", { n: paid, total: need })}</span>
          </div>
        </>
      ) : (
        <div className="mt-3 text-[15px] font-medium text-fg">{t("Без взноса")}</div>
      )}
      <p className="mt-3 text-micro leading-relaxed text-fg-3">{t(POT_DISCLAIMER)}</p>
    </section>
  );
}

/** Отметка о взносе у игрока: организатор переключает, остальные только видят */
export function PaidChip({ m, view, isHost, run, code }: { m: ViewMember; view: LobbyView; isHost: boolean; run: Run; code: string }) {
  const t = useT();
  const s = view.lobby.settings;
  if (!s.pot || s.pot_fee <= 0 || m.slot === "spec") return null;
  const cls = cn(
    "inline-flex h-7 shrink-0 items-center gap-1 rounded-chip border px-2 text-micro font-medium",
    m.paid ? "border-ok/40 bg-ok/10 text-ok" : "border-line-subtle text-fg-3",
  );
  const body = (
    <>
      {m.paid && Icon.check("size-3.5")}
      {m.paid ? t("взнос") : t("нет взноса")}
    </>
  );
  if (!isHost) return <span className={cls}>{body}</span>;
  return (
    <button
      type="button"
      onClick={() => run(() => A.togglePaid(code, m.id))}
      className={cn(cls, "transition-colors hover:border-line-strong hover:text-fg")}
      title={m.paid ? t("Снять отметку о взносе") : t("Отметить: взнос получен")}
    >
      {body}
    </button>
  );
}
