import { Container, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <>
      <div className="border-b border-line">
        <Container size="competition" className="pt-8 pb-14">
          <Skeleton className="h-4 w-40" />
          <div className="mt-12 grid grid-cols-[1fr_auto_1fr] items-center gap-10">
            <div className="flex items-center gap-5">
              <Skeleton className="size-16 rounded-xl" />
              <Skeleton className="h-8 w-40" />
            </div>
            <Skeleton className="h-16 w-36" />
            <div className="flex items-center justify-end gap-5">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="size-16 rounded-xl" />
            </div>
          </div>
        </Container>
      </div>
      <Container size="competition" className="pt-16 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </Container>
    </>
  );
}
