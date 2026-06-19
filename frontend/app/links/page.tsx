"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  buildShortUrl,
  listAnalyticsLinks,
  listLinks,
  type AnalyticsLinkSummary,
  type LinkResponse,
} from "@/lib/api";
import { loadAuthConfig, type AuthConfig } from "@/lib/auth";
import { CopyButton } from "@/components/CopyButton";

export default function LinkListPage() {
  const [links, setLinks] = useState<LinkResponse[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, AnalyticsLinkSummary>>({});
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLinks() {
      setIsLoading(true);
      setError(null);
      try {
        const [config, loadedLinks, loadedAnalytics] = await Promise.all([
          loadAuthConfig(),
          listLinks(),
          listAnalyticsLinks(),
        ]);
        setAuthConfig(config);
        setLinks(loadedLinks);
        setAnalytics(Object.fromEntries(loadedAnalytics.map((item) => [item.slug, item])));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load links.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadLinks();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="inline-flex border-2 border-ink bg-yellow px-2 py-1 text-xs font-black uppercase tracking-[0.14em]">
          Link cabinet
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-normal">Links</h1>
        <p className="mt-2 text-sm font-semibold text-ink/70">Tenant-scoped short links for the MVP.</p>
      </div>
      {error ? (
        <div className="retro-card-white bg-pink p-4 text-sm font-bold text-ink">
          {error}
          <Link className="ml-2 font-medium underline" href="/login">
            Login
          </Link>
        </div>
      ) : null}
      <div className="overflow-hidden border-4 border-ink bg-white shadow-retro">
        <table className="w-full text-left text-sm">
          <thead className="bg-yellow text-ink">
            <tr>
              <th className="border-b-4 border-ink px-4 py-3 font-black">Slug</th>
              <th className="border-b-4 border-ink px-4 py-3 font-black">Target URL</th>
              <th className="border-b-4 border-ink px-4 py-3 text-right font-black">Clicks</th>
              <th className="border-b-4 border-ink px-4 py-3 font-black">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 font-bold text-ink/70" colSpan={4}>
                  Loading links...
                </td>
              </tr>
            ) : null}
            {!isLoading && !error && links.length === 0 ? (
              <tr>
                <td className="px-4 py-6 font-bold text-ink/70" colSpan={4}>
                  No links yet.{" "}
                  <Link className="font-black text-ink underline" href="/links/create">
                    Create one
                  </Link>
                </td>
              </tr>
            ) : null}
            {links.map((link) => (
              <tr key={link.slug} className="border-t-2 border-ink">
                <td className="px-4 py-3 font-black">
                  <div className="flex min-w-48 flex-col gap-2 sm:flex-row sm:items-center">
                    {authConfig ? (
                      <>
                        <a
                          className="break-all text-ink underline"
                          href={buildShortUrl(authConfig, link.slug)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          /{link.slug}
                        </a>
                        <CopyButton
                          label="Copy"
                          value={buildShortUrl(authConfig, link.slug)}
                        />
                      </>
                    ) : (
                      `/${link.slug}`
                    )}
                  </div>
                </td>
                <td className="max-w-sm break-all px-4 py-3 font-semibold text-ink/70">
                  {link.target_url}
                </td>
                <td className="px-4 py-3 text-right font-black">
                  {analytics[link.slug]?.total_hits ?? 0}
                </td>
                <td className="px-4 py-3 font-semibold text-ink/70">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(link.created_at))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
