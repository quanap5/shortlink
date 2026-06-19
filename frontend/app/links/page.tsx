const links = [
  { slug: "launch", targetUrl: "https://example.com/launch", clicks: 84 },
  { slug: "docs", targetUrl: "https://example.com/docs", clicks: 31 },
  { slug: "pricing", targetUrl: "https://example.com/pricing", clicks: 13 },
];

export default function LinkListPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Links</h1>
        <p className="mt-2 text-sm text-slate-600">Tenant-scoped short links for the MVP.</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-mist text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Target URL</th>
              <th className="px-4 py-3 text-right font-medium">Clicks</th>
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link.slug} className="border-t border-line">
                <td className="px-4 py-3 font-medium">/{link.slug}</td>
                <td className="px-4 py-3 text-slate-600">{link.targetUrl}</td>
                <td className="px-4 py-3 text-right">{link.clicks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
