const stats = [
  { label: "Links", value: "3" },
  { label: "Clicks today", value: "128" },
  { label: "Tenants", value: "1" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium uppercase text-teal">MVP Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">ShortLink workspace</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Manage tenant-scoped short links, review click activity, and prepare DNS records for
          Cloudflare.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-line bg-white p-5">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
