import { Skeleton } from "../ui";
import { CARD, WRAP } from "../primitives";

/** Скелетон шапки страницы — повторяет PageHero: свет справа, надпись разрядкой, крупный заголовок */
export function HeroSkeleton({ media }: { media?: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_85%_0%,#1a2c48b3,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/[0.06]" />
      <div className={`${WRAP} relative flex flex-col gap-8 pt-14 pb-14 sm:flex-row sm:items-end lg:pt-20 lg:pb-16`}>
        {media && <Skeleton className="size-28 rounded-[16px] lg:size-36" />}
        <div className="flex-1 space-y-5">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-12 w-[min(520px,90%)] lg:h-16" />
          <Skeleton className="h-4 w-[min(420px,80%)]" />
        </div>
      </div>
    </section>
  );
}

/** Шапка и список строк в карточке */
export function ListSkeleton({ rows = 8, title = true }: { rows?: number; title?: boolean }) {
  return (
    <>
      {title && <HeroSkeleton />}
      <div className={`${WRAP} pt-10`}>
        <div className={`${CARD} px-6 lg:px-8`}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-white/[0.06] py-4 last:border-0">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Профиль: крупный аватар/лого, имя, ряд цифр */
export function ProfileSkeleton() {
  return (
    <>
      <HeroSkeleton media />
      <div className={`${WRAP} grid grid-cols-3 gap-6 pt-12 md:grid-cols-6`}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
      <ListSkeleton rows={5} title={false} />
    </>
  );
}
