import { Skeleton } from "@/components/ui";
import { WRAP } from "@/components/public/home";

export default function Loading() {
  return (
    <>
      <div className="border-b border-white/[0.06]">
        <div className={`${WRAP} pt-10 pb-16`}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mx-auto mt-14 h-3 w-64" />
          <div className="mt-12 grid grid-cols-[1fr_auto_1fr] items-center gap-10">
            <div className="flex items-center gap-6">
              <Skeleton className="size-24 rounded-xl" />
              <Skeleton className="h-10 w-48" />
            </div>
            <Skeleton className="h-24 w-48" />
            <div className="flex items-center justify-end gap-6">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="size-24 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
      <div className={`${WRAP} pt-16 space-y-4`}>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-48 w-full rounded-[12px]" />
      </div>
    </>
  );
}
