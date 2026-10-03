import { Container, Panel, Skeleton } from "@/components/ds";

/** Компактный skeleton page header в новой product-иерархии. */
export function HeroSkeleton({ media }: { media?: boolean }) {
  return (
    <div className="border-b border-line-subtle bg-shell">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:py-12">
        {media && <Skeleton className="size-20 rounded-feature sm:size-24" />}
        <div className="flex-1 space-y-4">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-9 w-[min(460px,90%)] sm:h-11" />
          <Skeleton className="h-4 w-[min(400px,80%)]" />
        </div>
      </Container>
    </div>
  );
}

/** Заголовок и список строк в общей F16 DS. */
export function ListSkeleton({ rows = 8, title = true }: { rows?: number; title?: boolean }) {
  return (
    <>
      {title && <HeroSkeleton />}
      <Container className="pt-8 sm:pt-10">
        <Panel padded={false} className="divide-y divide-line-subtle" aria-busy="true">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 sm:px-5">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-48 max-w-[45%]" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </Panel>
      </Container>
    </>
  );
}

/** Профиль: identity, факты и список. */
export function ProfileSkeleton() {
  return (
    <>
      <HeroSkeleton media />
      <Container className="grid grid-cols-3 gap-6 pt-10 md:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </Container>
      <ListSkeleton rows={5} title={false} />
    </>
  );
}
