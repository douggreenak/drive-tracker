export function SkeletonCard() {
  return (
    <div className="md-card animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="skeleton w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-6 w-28 rounded" />
          <div className="skeleton h-3 w-16 rounded" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="md-card animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <div className="flex gap-2">
            <div className="skeleton h-5 w-20 rounded-full" />
            <div className="skeleton h-5 w-14 rounded" />
          </div>
          <div className="skeleton h-4 w-48 rounded" />
          <div className="skeleton h-3 w-36 rounded" />
        </div>
        <div className="skeleton h-5 w-16 rounded ml-4" />
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md-card space-y-4">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-3 w-full rounded-full" />
          <div className="skeleton h-3 w-full rounded-full" />
        </div>
        <div className="md-card space-y-3">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-10 w-full rounded-full" />
          <div className="skeleton h-10 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
