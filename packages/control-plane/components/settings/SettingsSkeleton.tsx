export function SettingsSkeleton() {
  return (
    <div className="p-6 w-full max-w-3xl mx-auto">
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-background-200 rounded-xl w-2/3" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-background-200 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
