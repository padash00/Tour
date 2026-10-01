import { Container, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <Container className="pt-10">
      <Skeleton className="h-4 w-24" />
      <div className="mt-16 space-y-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-14 w-2/3 max-w-xl" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="mt-12 flex gap-6 border-b border-line pb-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-16" />
        ))}
      </div>
      <div className="mt-12 grid lg:grid-cols-[1fr_340px] gap-20">
        <div className="space-y-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </Container>
  );
}
