"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getAnalyticsBreakdown,
  getAnalyticsMap,
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getAnalyticsTopLinks,
  type AnalyticsBreakdownItem,
  type AnalyticsPoint,
  type AnalyticsRange,
  type AnalyticsSummary,
} from "@/lib/api";

const ranges: { label: string; value: AnalyticsRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
];

type DashboardData = {
  browsers: AnalyticsBreakdownItem[];
  cities: AnalyticsBreakdownItem[];
  countries: AnalyticsBreakdownItem[];
  devices: AnalyticsBreakdownItem[];
  mapPoints: AnalyticsBreakdownItem[];
  operatingSystems: AnalyticsBreakdownItem[];
  referrers: AnalyticsBreakdownItem[];
  summary: AnalyticsSummary;
  timeseries: AnalyticsPoint[];
  topLinks: AnalyticsBreakdownItem[];
};

const emptySummary: AnalyticsSummary = {
  active_links: 0,
  click_growth_percent: 0,
  top_link: null,
  top_link_clicks: 0,
  total_clicks: 0,
  total_links: 0,
  unique_visitors: 0,
};

export function AnalyticsDashboard() {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    async function loadAnalytics() {
      setIsLoading(true);
      setError(null);
      try {
        const [
          summary,
          timeseries,
          countries,
          cities,
          devices,
          browsers,
          operatingSystems,
          referrers,
          topLinks,
          mapPoints,
        ] = await Promise.all([
          getAnalyticsSummary(range),
          getAnalyticsTimeseries(range),
          getAnalyticsBreakdown("country", range, 10),
          getAnalyticsBreakdown("city", range, 10),
          getAnalyticsBreakdown("device", range, 10),
          getAnalyticsBreakdown("browser", range, 10),
          getAnalyticsBreakdown("os", range, 10),
          getAnalyticsBreakdown("referrer", range, 10),
          getAnalyticsTopLinks(range, 10),
          getAnalyticsMap(range),
        ]);
        setData({
          browsers,
          cities,
          countries,
          devices,
          mapPoints,
          operatingSystems,
          referrers,
          summary,
          timeseries,
          topLinks,
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load analytics.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadAnalytics();
  }, [range]);

  const summary = data?.summary ?? emptySummary;
  const chartData = useMemo(
    () => (data?.timeseries ?? []).map((point) => ({ ...point, date: shortDate(point.label) })),
    [data?.timeseries],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Analytics</h1>
          <p className="mt-2 text-sm text-slate-600">
            Click performance, audience source, and visitor trends for ShortLink.
          </p>
        </div>
        <div className="inline-flex w-fit rounded-md border border-line bg-white p-1">
          {ranges.map((item) => (
            <button
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                range === item.value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-mist"
              }`}
              key={item.value}
              onClick={() => setRange(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <Link className="ml-2 font-medium underline" href="/login">
            Login
          </Link>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total Clicks" value={summary.total_clicks} isLoading={isLoading} />
        <MetricCard label="Unique Visitors" value={summary.unique_visitors} isLoading={isLoading} />
        <MetricCard label="Total Links" value={summary.total_links} isLoading={isLoading} />
        <MetricCard label="Active Links" value={summary.active_links} isLoading={isLoading} />
        <MetricCard
          label="Top Link"
          value={summary.top_link ? `/${summary.top_link}` : "-"}
          detail={`${summary.top_link_clicks} clicks`}
          isLoading={isLoading}
        />
        <MetricCard
          label="Click Growth"
          value={`${summary.click_growth_percent}%`}
          detail="vs previous period"
          isLoading={isLoading}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel title="Traffic Trend">
          <div className="h-72 min-w-0">
            {!isMounted ? <EmptyState label="Loading chart..." /> : null}
            {isMounted ? (
            <ResponsiveContainer height="100%" width="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line dataKey="clicks" stroke="#0f766e" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
            ) : null}
          </div>
        </Panel>
        <Panel title="Top Countries">
          <BarList items={data?.countries ?? []} />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Devices">
          <MiniBarChart isMounted={isMounted} items={data?.devices ?? []} />
        </Panel>
        <Panel title="Browsers">
          <MiniBarChart isMounted={isMounted} items={data?.browsers ?? []} />
        </Panel>
        <Panel title="Operating Systems">
          <MiniBarChart isMounted={isMounted} items={data?.operatingSystems ?? []} />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top Links">
          <TableList emptyLabel="No tracked links yet." items={data?.topLinks ?? []} prefix="/" />
        </Panel>
        <Panel title="Referrers">
          <TableList emptyLabel="No referrers yet." items={data?.referrers ?? []} />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top Cities">
          <TableList emptyLabel="No city data yet." items={data?.cities ?? []} />
        </Panel>
        <Panel title="Map Points">
          <MapPoints items={data?.mapPoints ?? []} />
        </Panel>
      </section>
    </div>
  );
}

function MetricCard({
  detail,
  isLoading,
  label,
  value,
}: {
  detail?: string;
  isLoading: boolean;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold text-slate-950">{isLoading ? "-" : value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function BarList({ items }: { items: AnalyticsBreakdownItem[] }) {
  if (items.length === 0) {
    return <EmptyState label="No data yet." />;
  }
  const max = Math.max(...items.map((item) => item.clicks), 1);
  return (
    <div className="space-y-3">
      {items.slice(0, 6).map((item) => (
        <div key={item.key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{item.label}</span>
            <span className="font-medium text-slate-950">{item.clicks}</span>
          </div>
          <div className="h-2 rounded bg-slate-100">
            <div
              className="h-2 rounded bg-teal"
              style={{ width: `${Math.max((item.clicks / max) * 100, 6)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniBarChart({
  isMounted,
  items,
}: {
  isMounted: boolean;
  items: AnalyticsBreakdownItem[];
}) {
  if (items.length === 0) {
    return <EmptyState label="No data yet." />;
  }
  if (!isMounted) {
    return <EmptyState label="Loading chart..." />;
  }
  return (
    <div className="h-56 min-w-0">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={items.slice(0, 6)}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="clicks" fill="#0f766e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TableList({
  emptyLabel,
  items,
  prefix = "",
}: {
  emptyLabel: string;
  items: AnalyticsBreakdownItem[];
  prefix?: string;
}) {
  if (items.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-left text-sm">
        <tbody>
          {items.map((item) => (
            <tr className="border-t border-line first:border-t-0" key={item.key}>
              <td className="px-3 py-2 font-medium text-slate-800">
                {prefix}
                {item.label}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">{item.clicks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MapPoints({ items }: { items: AnalyticsBreakdownItem[] }) {
  const points = items.filter((item) => item.metadata.latitude && item.metadata.longitude);
  if (points.length === 0) {
    return <EmptyState label="No geolocation points yet." />;
  }
  return (
    <div className="space-y-2 text-sm">
      {points.slice(0, 8).map((item) => (
        <div className="flex items-center justify-between gap-4" key={item.key}>
          <div>
            <p className="font-medium text-slate-800">{item.label}</p>
            <p className="text-xs text-slate-500">
              {item.metadata.latitude}, {item.metadata.longitude}
            </p>
          </div>
          <span className="font-medium text-slate-950">{item.clicks}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-slate-500">{label}</p>;
}

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return month && day ? `${month}/${day}` : value;
}
