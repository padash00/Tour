"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { enqueueSelfCheck, getServerState } from "@/lib/server-control";
import type { ActionResult } from "@/components/forms";

/** «Проверка перед турниром»: агент сам запускает активные серверы, проверяет и возвращает как было */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- сигнатура useActionState
export async function runSelfCheck(_prev: ActionResult, _formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/servers");
  const { online, host } = await getServerState();
  if (!online) return { error: "Server Agent не на связи — проверить серверы нельзя" };
  const busy = (host?.info as { busy?: string | null } | undefined)?.busy;
  if (busy) return { error: `Агент занят: ${busy}. Повторите, когда закончит.` };
  await enqueueSelfCheck(admin.id);
  await audit(admin.id, "server.self_check");
  revalidatePath("/admin/servers");
  return { success: "Проверка запущена — займёт 1–5 минут. Отчёт появится здесь." };
}
