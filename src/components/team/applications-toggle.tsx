"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAcceptsApplications } from "@/app/actions/applications";
import { Toggle } from "@/components/ds";
import { useToast } from "@/components/toast";

/** Капитан включает или выключает приём заявок на вступление */
export function ApplicationsToggle({ accepts }: { accepts: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(accepts);
  const [pending, start] = useTransition();
  const change = (v: boolean) =>
    start(async () => {
      setOn(v);
      const fd = new FormData();
      fd.set("accepts", v ? "1" : "0");
      const r = await setAcceptsApplications(null, fd);
      if (r?.error) {
        setOn(!v);
        toast.error(r.error);
      } else if (r?.success) toast.success(r.success);
      router.refresh();
    });
  return <Toggle on={on} onChange={change} disabled={pending} label="Принимать заявки на вступление" />;
}
