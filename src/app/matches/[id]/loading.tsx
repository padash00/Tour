import { Container, Skeleton } from "@/components/ds";

export default function Loading() {
  return (
    <>
      <div className="border-b border-white/[0.06]">
        <Container width="wide" className="pb-12 pt-8 sm:pb-16 sm:pt-10">
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
        </Container>
      </div>
      <Container width="wide" className="space-y-4 pt-12 sm:pt-16">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-48 w-full rounded-[12px]" />
      </Container>
    </>
  );
}
