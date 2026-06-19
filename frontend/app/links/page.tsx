"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildShortUrl, listLinks, type LinkResponse } from "@/lib/api";
import { loadAuthConfig, type AuthConfig } from "@/lib/auth";

export default function LinkListPage() {
  const [links, setLinks] = useState<LinkResponse[]>([]);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLinks() {
      setIsLoading(true);
      setError(null);
      try {
        const [config, loadedLinks] = await Promise.all([loadAuthConfig(), listLinks()]);
        setAuthConfig(config);
        setLinks(loadedLinks);
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
        <h1 className="text-2xl font-semibold tracking-normal">Links</h1>
        <p className="mt-2 text-sm text-slate-600">Tenant-scoped short links for the MVP.</p>
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <Link className="ml-2 font-medium underline" href="/login">
            Login
          </Link>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-mist text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Target URL</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 text-slate-600" colSpan={3}>
                  Loading links...
                </td>
              </tr>
            ) : null}
            {!isLoading && !error && links.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-600" colSpan={3}>
                  No links yet.{" "}
                  <Link className="font-medium text-teal underline" href="/links/create">
                    Create one
                  </Link>
                </td>
              </tr>
            ) : null}
            {links.map((link) => (
              <tr key={link.slug} className="border-t border-line">
                <td className="px-4 py-3 font-medium">
                  {authConfig ? (
                    <a
                      className="break-all text-teal underline"
                      href={buildShortUrl(authConfig, link.slug)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      /{link.slug}
                    </a>
                  ) : (
                    `/${link.slug}`
                  )}
                </td>
                <td className="max-w-sm break-all px-4 py-3 text-slate-600">{link.target_url}</td>
                <td className="px-4 py-3 text-slate-600">
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
