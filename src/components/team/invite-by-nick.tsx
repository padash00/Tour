"use client";

import { useRouter } from "next/navigation";
import { Search, UserPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { searchInvitees, sendInvite, type InviteCandidate } from "@/app/actions/invites";
import { Button, Dialog, FaceitLevel, PlayerIdentity, SearchInput, type ButtonSize, type ButtonVariant } from "@/components/ds";
import { useToast } from "@/components/toast";

/**
 * «Пригласить по нику»: капитан ищет зарегистрированного игрока и зовёт его игроком или тренером.
 * Игрок получает уведомление и подтверждает приглашение сам.
 */
export function InviteByNick({
  role = "player",
  label,
  size = "md",
  variant = "secondary",
}: {
  role?: "player" | "coach";
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<InviteCandidate[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [sending, startSend] = useTransition();
  const [sent, setSent] = useState<Set<string>>(new Set());

  // поиск с задержкой — не на каждую букву
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    const t = setTimeout(() => {
      if (query.length < 2) {
        startSearch(() => setResults(null));
        return;
      }
      startSearch(async () => setResults(await searchInvitees(query)));
    }, 300);
    return () => clearTimeout(t);
  }, [q, open]);

  const invite = (p: InviteCandidate) =>
    startSend(async () => {
      const fd = new FormData();
      fd.set("playerId", p.id);
      fd.set("role", role);
      const r = await sendInvite(null, fd);
      if (r?.error) toast.error(r.error);
      else {
        if (r?.success) toast.success(r.success);
        setSent((s) => new Set(s).add(p.id));
        router.refresh();
        if (role === "coach") setOpen(false);
      }
    });

  const coach = role === "coach";
  return (
    <>
      <Button size={size} variant={variant} icon={<UserPlus />} onClick={() => setOpen(true)}>
        {label ?? (coach ? "Пригласить тренера" : "Пригласить по нику")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={coach ? "Пригласить тренера" : "Пригласить игрока по нику"}
        description={
          coach
            ? "Тренер не играет и не входит в 5 + 2, но указывается в заявках на турниры. Он может тренировать и другие команды."
            : "Игрок должен быть зарегистрирован на сайте (вход через Steam). Он получит уведомление и подтвердит вступление."
        }
      >
        <SearchInput value={q} onChange={setQ} loading={searching} placeholder="Ник или SteamID64" autoFocus />
        <div className="mt-4 min-h-24">
          {results === null ? (
            <p className="flex items-center gap-2 text-meta text-fg-3">
              <Search className="size-4" aria-hidden /> Введите хотя бы 2 символа ника.
            </p>
          ) : results.length === 0 ? (
            <p className="text-meta text-fg-3">
              Никого не нашли. Если игрок ещё не заходил на сайт — отправьте ему ссылку-приглашение.
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {results.map((p) => {
                const busy = !coach && !!p.team;
                const done = sent.has(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <PlayerIdentity
                        name={p.nickname}
                        avatar={p.avatar_url}
                        size="md"
                        meta={p.team ? `В команде ${p.team}` : "Без команды"}
                        trailing={<FaceitLevel level={p.faceit_level} />}
                      />
                    </div>
                    <Button size="sm" variant={done ? "ghost" : "primary"} disabled={busy || done || sending} onClick={() => invite(p)}>
                      {done ? "Отправлено" : busy ? "Занят" : "Пригласить"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}
