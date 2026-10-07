"use client";

import { useActionState, useEffect } from "react";
import { replayRelayEvents } from "@/app/actions/admin-server";
import { SubmitButton } from "@/components/forms";
import { useToast } from "@/components/toast";

/** Вернуть отложенные агентом события матчей в очередь отправки на сайт */
export function ReplayRelayButton() {
  const [state, action] = useActionState(replayRelayEvents, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.success) toast.success(state.success);
  }, [state, toast]);

  return (
    <form action={action}>
      <SubmitButton size="sm" variant="secondary" confirm="Вернуть отложенные события в очередь? Сайт обработает их заново.">
        Повторить
      </SubmitButton>
    </form>
  );
}
