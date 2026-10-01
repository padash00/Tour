import { Container, Skeleton } from "../ui";

/** Заголовок страницы и строки списка */
export function ListSkeleton({ rows = 8, title = true }: { rows?: number; title?: boolean }) {
  return (
    <Container>
      {title && <Skeleton className="mt-20 mb-12 h-12 w-64" />}
      <div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 py-4 border-b border-white/[0.06]">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </Container>
  );
}

/** Профиль: крупный аватар/лого, имя, ряд цифр */
export function ProfileSkeleton() {
  return (
    <>
      <Container className="pt-16 pb-14 md:pt-24 flex flex-col md:flex-row md:items-end gap-8">
        <Skeleton className="size-32 rounded-2xl" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-14 w-80 max-w-full" />
          <Skeleton className="h-4 w-56" />
        </div>
      </Container>
      <Container className="pt-14 grid grid-cols-3 md:grid-cols-6 gap-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </Container>
      <ListSkeleton rows={5} title={false} />
    </>
  );
}
