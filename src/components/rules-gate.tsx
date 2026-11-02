"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScrollText } from "lucide-react";
import { Button, Dialog, cn } from "@/components/ds";
import { useViewer } from "@/components/viewer";
import { noChrome } from "@/components/shell/nav";

/*
 * Регламент перед заявкой: текст в окне с прокруткой, галочка «прочитал» доступна только после прокрутки до конца.
 * RulesGate стоит на странице заявки один раз; формы заявки читают его состояние через useRulesOk.
 * RulesAckModal — для игроков уже поданных команд: окно при заходе на сайт, пока не нажмут «Прочитал».
 */

const okMap = new Map<string, boolean>();
const listeners = new Set<() => void>();
const setOk = (id: string, ok: boolean) => {
  okMap.set(id, ok);
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Капитан прочитал регламент турнира и поставил галочку */
export function useRulesOk(tournamentId: string) {
  return useSyncExternalStore(
    subscribe,
    () => okMap.get(tournamentId) ?? false,
    () => false,
  );
}

/** Текст регламента с прокруткой; onRead — когда дочитали до конца */
function RulesReader({ rules, onRead, className }: { rules: string; onRead: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const check = () => {
    const el = ref.current;
    if (!el || done.current) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
      done.current = true;
      onRead();
    }
  };
  useEffect(() => {
    // короткий регламент без прокрутки считается прочитанным сразу
    const id = requestAnimationFrame(check);
    return () => cancelAnimationFrame(id);
  });
  return (
    <div
      ref={ref}
      onScroll={check}
      tabIndex={0}
      aria-label="Текст регламента"
      className={cn("prose-f16 overflow-y-auto overscroll-contain whitespace-pre-line rounded-control border border-line bg-bg-2 p-4 text-[14px] leading-relaxed text-fg-2", className)}
    >
      {rules}
    </div>
  );
}

function AgreeRow({ read, checked, onChange }: { read: boolean; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-3 space-y-2">
      {!read && <p className="text-meta font-medium text-warn">Прокрутите регламент до конца — после этого можно поставить галочку.</p>}
      <label className={cn("flex items-start gap-3 text-[15px]", read ? "cursor-pointer text-fg" : "cursor-not-allowed text-fg-3")}>
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--color-accent)]" disabled={!read} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>Я прочитал регламент турнира полностью и согласен с ним</span>
      </label>
    </div>
  );
}

/** Блок «Регламент турнира» на странице заявки: без него кнопка «Подать заявку» не активна */
export function RulesGate({ tournamentId, rules }: { tournamentId: string; rules: string }) {
  const [read, setRead] = useState(false);
  const checked = useRulesOk(tournamentId);
  return (
    <section aria-labelledby="rules-gate-title" className="rounded-card border border-accent/30 bg-surface p-4 sm:p-5">
      <h2 id="rules-gate-title" className="flex items-center gap-2 text-heading text-fg">
        <ScrollText className="size-5 text-accent" aria-hidden />
        Регламент турнира
      </h2>
      <p className="mt-1 text-meta text-fg-3">Перед подачей заявки прочитайте регламент полностью — кнопка «Подать заявку» станет доступна после подтверждения.</p>
      <RulesReader rules={rules} onRead={() => setRead(true)} className="mt-3 max-h-[55vh]" />
      <AgreeRow read={read} checked={checked} onChange={(v) => setOk(tournamentId, v)} />
    </section>
  );
}

type Pending = { id: string; name: string; slug: string; rules: string };

/** Окно с регламентом для игроков поданных команд — ставится один раз в layout */
export function RulesAckModal() {
  const { player } = useViewer();
  const pathname = usePathname();
  const [pending, setPending] = useState<Pending | null>(null);
  const [read, setRead] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const playerId = player?.id ?? null;

  useEffect(() => {
    if (!playerId || noChrome(pathname) || pathname.includes("/register")) return;
    let alive = true;
    fetch("/api/rules-ack", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { pending: null }))
      .then((d: { pending: Pending | null }) => {
        if (!alive) return;
        setPending((cur) => (cur?.id === d.pending?.id ? cur : d.pending));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [playerId, pathname]);

  if (!pending) return null;
  const confirm = async () => {
    setSaving(true);
    await fetch("/api/rules-ack", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: pending.id }) }).catch(() => {});
    setSaving(false);
    setRead(false);
    setChecked(false);
    setPending(null);
  };
  return (
    <Dialog
      open
      onClose={() => {}}
      dismissible={false}
      size="lg"
      title={`Регламент «${pending.name}»`}
      description="Ваша команда подала заявку на турнир. Прочитайте регламент полностью — это обязательно для всех игроков."
      footer={
        <Button onClick={confirm} loading={saving} disabled={!checked} className="w-full sm:w-auto">
          Прочитал, согласен
        </Button>
      }
    >
      <RulesReader key={pending.id} rules={pending.rules} onRead={() => setRead(true)} className="max-h-[50vh]" />
      <AgreeRow read={read} checked={checked} onChange={setChecked} />
    </Dialog>
  );
}
