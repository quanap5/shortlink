const stats = [
  {
    accent: "bg-yellow",
    icon: (
      <svg
        aria-label="Total links icon"
        className="h-7 w-7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        viewBox="0 0 32 32"
      >
        <path d="M12 11 9 11c-4 0-7 3-7 7s3 7 7 7h4" />
        <path d="M20 21h3c4 0 7-3 7-7s-3-7-7-7h-4" />
        <path d="M10 18h12" />
        <path d="M6 5 4 3" />
        <path d="M26 29 28 31" />
      </svg>
    ),
    label: "Links",
    value: "3",
  },
  {
    accent: "bg-pink",
    icon: (
      <svg
        aria-label="Total clicks icon"
        className="h-7 w-7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        viewBox="0 0 32 32"
      >
        <path d="M10 4v14l4-3 3 8 4-2-3-8 5-1Z" />
        <path d="M23 5 28 2" />
        <path d="M24 12h6" />
        <path d="M18 3l2-3" />
      </svg>
    ),
    label: "Clicks today",
    value: "128",
  },
  {
    accent: "bg-teal",
    icon: (
      <svg
        aria-label="Total tenants icon"
        className="h-7 w-7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        viewBox="0 0 32 32"
      >
        <path d="M6 28V9l10-5 10 5v19" />
        <path d="M11 28v-7h10v7" />
        <path d="M10 12h2" />
        <path d="M20 12h2" />
        <path d="M10 17h2" />
        <path d="M20 17h2" />
        <path d="M3 28h26" />
      </svg>
    ),
    label: "Tenants",
    value: "1",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section className="retro-card bg-yellow p-6">
        <p className="inline-flex border-2 border-ink bg-white px-2 py-1 text-xs font-black uppercase tracking-[0.16em]">
          Link Dashboard
        </p>
        <h1 className="mt-3 text-4xl font-black uppercase tracking-normal md:text-6xl">
          TwinQX ShortLink
        </h1>
        <p className="mt-4 max-w-2xl text-base font-semibold text-ink">
          Branded short links and click analytics for the TwinQX industrial intelligence stack.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="group/stat retro-card-white p-5 transition-transform duration-150 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-warm">
                  {stat.label}
                </p>
                <p className="mt-2 text-4xl font-black">{stat.value}</p>
              </div>
              <div
                className={`${stat.accent} flex h-12 w-12 shrink-0 items-center justify-center border-4 border-ink text-ink shadow-[4px_4px_0_#2a1a12] transition-transform duration-150 group-hover/stat:-translate-y-1 group-hover/stat:-rotate-3`}
              >
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
