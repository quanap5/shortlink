"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  buildShortUrl,
  listAnalyticsLinks,
  listLinks,
  type AnalyticsLinkSummary,
  type LinkResponse,
} from "@/lib/api";
import { loadAuthConfig, type AuthConfig } from "@/lib/auth";
import { CopyButton } from "@/components/CopyButton";
import { QrCodeActions } from "@/components/QrCodeActions";

type SortKey = "slug" | "created_at" | "clicks" | "status";
type SortDirection = "asc" | "desc";

export default function LinkListPage() {
  const [links, setLinks] = useState<LinkResponse[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, AnalyticsLinkSummary>>({});
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [pageSize, setPageSize] = useState(10);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");

  const loadLinks = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
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
  }, []);

  useEffect(() => {
    void loadLinks(true);
    const refreshTimer = setInterval(() => {
      void loadLinks();
    }, 15000);

    return () => clearInterval(refreshTimer);
  }, [loadLinks]);

  function updateSort(nextKey: SortKey) {
    setCurrentPage(1);
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "created_at" || nextKey === "clicks" ? "desc" : "asc");
  }

  function updatePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setCurrentPage(1);
  }

  const sortedLinks = [...links].sort((left, right) => {
    const direction = sortDirection === "asc" ? 1 : -1;
    if (sortKey === "clicks") {
      return (
        ((analytics[left.slug]?.total_hits ?? 0) - (analytics[right.slug]?.total_hits ?? 0)) *
        direction
      );
    }
    if (sortKey === "created_at") {
      return (new Date(left.created_at).getTime() - new Date(right.created_at).getTime()) * direction;
    }
    return left[sortKey].localeCompare(right[sortKey]) * direction;
  });

  const totalPages = Math.max(1, Math.ceil(sortedLinks.length / pageSize));
  const boundedCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (boundedCurrentPage - 1) * pageSize;
  const paginatedLinks = sortedLinks.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    const total = Math.max(1, Math.ceil(links.length / pageSize));
    if (currentPage > total) {
      setCurrentPage(total);
    }
  }, [currentPage, links.length, pageSize]);

  return (
    <div className="space-y-6">
      <div>
        <p className="inline-flex border-2 border-ink bg-yellow px-2 py-1 text-xs font-black uppercase tracking-[0.14em]">
          Link cabinet
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-normal">Links</h1>
        <p className="mt-2 text-sm font-semibold text-ink/70">
          Tenant-scoped short links with click counts that refresh automatically.
        </p>
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
              <SortableHeader
                active={sortKey === "slug"}
                direction={sortDirection}
                label="Slug"
                onClick={() => updateSort("slug")}
              />
              <th className="border-b-4 border-ink px-4 py-3 font-black">Target URL</th>
              <SortableHeader
                active={sortKey === "status"}
                direction={sortDirection}
                label="Status"
                onClick={() => updateSort("status")}
              />
              <th className="border-b-4 border-ink px-4 py-3 font-black">Tags</th>
              <th className="border-b-4 border-ink px-4 py-3 font-black">QR</th>
              <SortableHeader
                active={sortKey === "clicks"}
                align="right"
                direction={sortDirection}
                label="Clicks"
                onClick={() => updateSort("clicks")}
              />
              <SortableHeader
                active={sortKey === "created_at"}
                direction={sortDirection}
                label="Created"
                onClick={() => updateSort("created_at")}
              />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 font-bold text-ink/70" colSpan={7}>
                  Loading links...
                </td>
              </tr>
            ) : null}
            {!isLoading && !error && links.length === 0 ? (
              <tr>
                <td className="px-4 py-6 font-bold text-ink/70" colSpan={7}>
                  No links yet.{" "}
                  <Link className="font-black text-ink underline" href="/links/create">
                    Create one
                  </Link>
                </td>
              </tr>
            ) : null}
            {paginatedLinks.map((link) => (
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
                <td className="px-4 py-3">
                  <StatusBadge status={link.status} />
                </td>
                <td className="px-4 py-3">
                  <TagList tags={link.tags ?? []} />
                </td>
                <td className="px-4 py-3">
                  <QrCodeActions slug={link.slug} />
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
        <PaginationControls
          currentPage={boundedCurrentPage}
          onNext={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
          onPageSizeChange={updatePageSize}
          onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
          pageSize={pageSize}
          totalItems={sortedLinks.length}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}

function SortableHeader({
  active,
  align = "left",
  direction,
  label,
  onClick,
}: {
  active: boolean;
  align?: "left" | "right";
  direction: SortDirection;
  label: string;
  onClick: () => void;
}) {
  return (
    <th
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`border-b-4 border-ink px-4 py-3 font-black ${
        align === "right" ? "text-right" : ""
      }`}
    >
      <button
        className="group/sort inline-flex min-h-9 items-center gap-2 border-2 border-transparent px-2 py-1 font-black uppercase transition-transform hover:-translate-y-0.5 hover:border-ink hover:bg-cream focus:outline-none focus:ring-4 focus:ring-cream"
        onClick={onClick}
        title={`Sort by ${label}`}
        type="button"
      >
        {label}
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center text-ink/60 transition-transform group-hover/sort:translate-y-0.5 group-hover/sort:text-ink"
        >
          {active ? (
            direction === "asc" ? (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
              >
                <path d="m6 15 6-6 6 6" />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            )
          ) : (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
            >
              <path d="m8 7 4-4 4 4" />
              <path d="m16 17-4 4-4-4" />
            </svg>
          )}
        </span>
      </button>
    </th>
  );
}

function PaginationControls({
  currentPage,
  onNext,
  onPageSizeChange,
  onPrevious,
  pageSize,
  totalItems,
  totalPages,
}: {
  currentPage: number;
  onNext: () => void;
  onPageSizeChange: (pageSize: number) => void;
  onPrevious: () => void;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}) {
  const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  return (
    <div className="flex flex-col gap-3 border-t-4 border-ink bg-cream px-4 py-3 text-sm font-bold sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {firstItem}-{lastItem} of {totalItems}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="border-2 border-ink bg-white px-2 py-1 font-black"
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          value={pageSize}
        >
          <option value={10}>10 rows</option>
          <option value={25}>25 rows</option>
          <option value={50}>50 rows</option>
        </select>
        <button
          aria-label="Previous page"
          className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-transparent text-ink transition-transform hover:-translate-x-0.5 focus:outline-none focus:ring-4 focus:ring-yellow disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0"
          disabled={currentPage <= 1}
          onClick={onPrevious}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
          >
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <span className="font-black">
          Page {currentPage} / {totalPages}
        </span>
        <button
          aria-label="Next page"
          className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-transparent text-ink transition-transform hover:translate-x-0.5 focus:outline-none focus:ring-4 focus:ring-yellow disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0"
          disabled={currentPage >= totalPages}
          onClick={onNext}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            viewBox="0 0 24 24"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: LinkResponse["status"] }) {
  const className =
    status === "active"
      ? "bg-vintage-mint"
      : status === "disabled"
        ? "bg-pink"
        : "bg-cream";
  return (
    <span
      className={`inline-flex border-2 border-ink px-2 py-1 text-xs font-black uppercase ${className}`}
    >
      {status}
    </span>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-xs font-bold text-ink/50">No tags</span>;
  }
  return (
    <div className="flex max-w-xs flex-wrap gap-1">
      {tags.map((tag) => (
        <span className="border-2 border-ink bg-yellow px-2 py-0.5 text-xs font-black" key={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}
