export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl"
      role="banner"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight" title={title}>
            {title || "Untitled"}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={subtitle}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
