export default function CarCardSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden animate-pulse">
      {/* Image placeholder */}
      <div className="aspect-[16/10] bg-muted" />

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <div className="h-5 bg-muted rounded w-4/5" />

        {/* Chips row */}
        <div className="flex gap-2">
          <div className="h-5 w-12 bg-muted rounded-md" />
          <div className="h-5 w-10 bg-muted rounded-md" />
          <div className="h-5 w-14 bg-muted rounded-md" />
        </div>

        {/* Specs grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <div className="h-3 w-12 bg-muted rounded mb-1" />
            <div className="h-5 w-20 bg-muted rounded" />
          </div>
          <div>
            <div className="h-3 w-12 bg-muted rounded mb-1" />
            <div className="h-5 w-16 bg-muted rounded" />
          </div>
        </div>

        {/* FREAKStats button placeholder */}
        <div className="h-10 bg-muted rounded-lg" />

        {/* View source placeholder */}
        <div className="h-9 bg-muted/50 rounded-lg" />
      </div>
    </div>
  );
}
