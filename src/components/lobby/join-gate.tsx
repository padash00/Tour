"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView } from "@/lib/lobby-view";
import { useToast } from "../toast";
import { Button, FeatureSurface } from "@/components/ds";

// ───────────────────────── вход в закрытое лобби

export function Gate({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-read px-5 py-20 sm:py-28">
      <FeatureSurface className="text-center">
        <h1 className="text-heading text-fg">{title}</h1>
        <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-relaxed text-fg-2">{text}</p>
        {children && <div className="mt-7">{children}</div>}
      </FeatureSurface>
    </div>
  );
}

export function JoinGate({ code, view, invite, onJoined }: { code: string; view: LobbyView; invite: string | null; onJoined: () => Promise<void> }) {
  const router = useRouter();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pending, start] = useTransition();

  if (!view.me) {
    return (
      <Gate title="Вход в лобби" text="Авторизуйтесь через Steam — после входа вернём вас в эту же комнату.">
        <Button href={`/login?next=${encodeURIComponent(`/lobby/${code}${invite ? `?t=${invite}` : ""}`)}`} size="lg">
          Войти через Steam
        </Button>
      </Gate>
    );
  }

  const join = () =>
    start(async () => {
      const r = await A.joinLobby(code, { password: pw, invite: invite ?? undefined });
      if (r?.error) {
        toast.error(r.error);
        if (r.code && r.code !== code) router.push(`/lobby/${r.code}`);
        return;
      }
      await onJoined();
    });

  return (
    <Gate
      title={view.lobby.visibility === "private" ? "Приватное лобби" : "Лобби по паролю"}
      text={invite ? "У вас действующая ссылка-приглашение — пароль не нужен." : `Хост ${view.lobby.host_name !== "—" ? view.lobby.host_name : ""} ограничил вход в комнату.`}
    >
      <form
        className="mx-auto max-w-sm space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        {!invite && (
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Пароль"
            autoFocus
            className="h-12 w-full rounded-control border border-line bg-shell px-4 text-[15px] text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-dim)]"
          />
        )}
        <Button type="submit" block size="lg" loading={pending}>
          Войти в лобби
        </Button>
      </form>
    </Gate>
  );
}
