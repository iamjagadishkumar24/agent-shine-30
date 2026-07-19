export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <header
      className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl"
      role="banner"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5 sm:px-8 sm:py-6">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="eyebrow mb-1.5" title={eyebrow}>
              {eyebrow}
            </p>
          ) : null}
          <h1 className="page-title truncate" title={title}>
            {title || "Untitled"}
          </h1>
          {subtitle ? (
            <p className="page-subtitle mt-1.5 line-clamp-1" title={subtitle}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
