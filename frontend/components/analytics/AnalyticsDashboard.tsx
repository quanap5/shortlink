"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  { label: "1Y", value: "365d" },
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

const AUTO_REFRESH_MS = 15_000;
const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];
const monthFormatter = new Intl.DateTimeFormat("en", { month: "short" });

const approximateCoordinates: Record<
  string,
  { latitude: number; longitude: number; label: string }
> = {
  AU: { latitude: -25.2744, longitude: 133.7751, label: "Australia" },
  CA: { latitude: 56.1304, longitude: -106.3468, label: "Canada" },
  DE: { latitude: 51.1657, longitude: 10.4515, label: "Germany" },
  FR: { latitude: 46.2276, longitude: 2.2137, label: "France" },
  GB: { latitude: 55.3781, longitude: -3.436, label: "United Kingdom" },
  IN: { latitude: 20.5937, longitude: 78.9629, label: "India" },
  JP: { latitude: 36.2048, longitude: 138.2529, label: "Japan" },
  KR: { latitude: 36.5, longitude: 127.8, label: "South Korea" },
  SG: { latitude: 1.3521, longitude: 103.8198, label: "Singapore" },
  TH: { latitude: 15.87, longitude: 100.9925, label: "Thailand" },
  US: { latitude: 39.8283, longitude: -98.5795, label: "United States" },
  VN: { latitude: 14.0583, longitude: 108.2772, label: "Vietnam" },
};

export function AnalyticsDashboard() {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadAnalytics = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
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
        setLastUpdatedAt(new Date());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load analytics.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [range],
  );

  useEffect(() => {
    void loadAnalytics();
    const refreshId = window.setInterval(() => {
      void loadAnalytics({ background: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(refreshId);
  }, [loadAnalytics]);

  const summary = data?.summary ?? emptySummary;
  const chartData = useMemo(
    () => (data?.timeseries ?? []).map((point) => ({ ...point, date: shortDate(point.label) })),
    [data?.timeseries],
  );

  return (
    <div className="space-y-8">
      <div className="retro-card bg-yellow p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 inline-flex border-2 border-ink bg-white px-2 py-1 text-xs font-black uppercase tracking-[0.16em]">
              Signal board
            </p>
            <h1 className="text-3xl font-black tracking-normal md:text-5xl">Analytics</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold text-ink md:text-base">
              Click performance, audience source, and visitor trends for TwinQX ShortLink.
            </p>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-ink/70">
              Auto refresh every 15s
              {lastUpdatedAt ? ` - Updated ${formatUpdateTime(lastUpdatedAt)}` : ""}
              {isRefreshing ? " - Refreshing..." : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="retro-button min-h-11 bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || isRefreshing}
              onClick={() => void loadAnalytics({ background: true })}
              type="button"
            >
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>
            <div className="inline-flex w-fit border-4 border-ink bg-white p-1 shadow-retro-sm">
              {ranges.map((item) => (
                <button
                  className={`min-h-11 px-4 py-2 text-sm font-black transition-colors ${
                    range === item.value ? "bg-ink text-white" : "text-ink hover:bg-vintage-mint"
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
        </div>
      </div>

      {error ? (
        <div className="retro-card-white p-4 text-sm font-semibold text-red-700">
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

      <Panel title="Daily Hits">
        <DailyHitsHeatmap points={data?.timeseries ?? []} range={range} />
      </Panel>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel title="Traffic Trend">
          <div className="h-72 min-w-0">
            {!isMounted ? <EmptyState label="Loading chart..." /> : null}
            {isMounted ? (
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#17202a" strokeDasharray="4 4" strokeOpacity={0.18} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#17202a" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#17202a" }} />
                  <Tooltip />
                  <Line
                    dataKey="clicks"
                    dot={{ fill: "#ffd91f", r: 4, stroke: "#17202a", strokeWidth: 2 }}
                    stroke="#167a7f"
                    strokeWidth={4}
                    type="monotone"
                  />
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
        <Panel title="Location Map">
          <GeoMap items={data?.mapPoints ?? []} />
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
    <div className="retro-card-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-warm">{label}</p>
      <p className="mt-2 truncate text-3xl font-black text-ink">{isLoading ? "-" : value}</p>
      {detail ? <p className="mt-1 text-xs font-bold text-ink/70">{detail}</p> : null}
    </div>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="retro-card-white p-5">
      <h2 className="mb-4 inline-flex border-2 border-ink bg-vintage-mint px-2 py-1 text-sm font-black uppercase tracking-[0.12em] text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DailyHitsHeatmap({
  points,
  range,
}: {
  points: AnalyticsPoint[];
  range: AnalyticsRange;
}) {
  const cells = buildHeatmapCells(points);
  if (cells.length === 0) {
    return <EmptyState label="No daily hit data yet." />;
  }

  const totalHits = points.reduce((total, point) => total + point.clicks, 0);
  const maxWeek = Math.max(...cells.map((cell) => cell.week), 0);
  const monthLabels = buildMonthLabels(cells);
  const levels = [0, 1, 2, 3, 4];

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-base font-black text-ink">
          {totalHits.toLocaleString()} hits in the last {rangeCopy(range)}
        </p>
        <p className="text-xs font-black uppercase tracking-[0.12em] text-ink/70">
          Daily click activity
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[720px] rounded-none border-4 border-ink bg-chocolate p-4 text-white shadow-retro-sm">
          <div
            className="ml-10 grid gap-1 text-xs font-bold text-cream/80"
            style={{
              gridTemplateColumns: `repeat(${maxWeek + 1}, 12px)`,
            }}
          >
            {monthLabels.map((label) => (
              <span
                className="h-5 whitespace-nowrap"
                key={`${label.month}-${label.week}`}
                style={{ gridColumn: `${label.week + 1} / span 4` }}
              >
                {label.month}
              </span>
            ))}
          </div>

          <div className="mt-1 flex gap-2">
            <div
              className="grid w-8 gap-1 text-xs font-bold text-cream/80"
              style={{ gridTemplateRows: "repeat(7, 12px)" }}
            >
              {dayLabels.map((label, index) => (
                <span className="leading-3" key={`${label}-${index}`}>
                  {label}
                </span>
              ))}
            </div>
            <div
              aria-label={`${totalHits.toLocaleString()} hits in the last ${rangeCopy(range)}`}
              className="grid grid-flow-col gap-1"
              role="img"
              style={{
                gridTemplateColumns: `repeat(${maxWeek + 1}, 12px)`,
                gridTemplateRows: "repeat(7, 12px)",
              }}
            >
              {cells.map((cell) => (
                <span
                  aria-label={`${cell.clicks} hits on ${cell.dateLabel}`}
                  className="h-3 w-3 border border-cream/10 transition-transform hover:-translate-y-0.5 hover:scale-125 hover:border-white focus:outline-none focus:ring-2 focus:ring-yellow"
                  key={cell.label}
                  role="img"
                  style={{
                    backgroundColor: heatmapColor(cell.level),
                    gridColumn: cell.week + 1,
                    gridRow: cell.weekday + 1,
                  }}
                  tabIndex={0}
                  title={`${cell.clicks} hits on ${cell.dateLabel}`}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 text-xs font-bold text-cream/80">
            <span>Less</span>
            {levels.map((level) => (
              <span
                aria-label={`Heat level ${level}`}
                className="h-3 w-3 border border-cream/10"
                key={level}
                style={{ backgroundColor: heatmapColor(level) }}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
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
            <span className="truncate font-bold text-ink">{item.label}</span>
            <span className="font-black text-ink">{item.clicks}</span>
          </div>
          <div className="h-3 border-2 border-ink bg-cream">
            <div
              className="h-full bg-yellow"
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
          <CartesianGrid stroke="#17202a" strokeDasharray="4 4" strokeOpacity={0.18} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#17202a" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#17202a" }} />
          <Tooltip />
          <Bar dataKey="clicks" fill="#ffd91f" radius={[0, 0, 0, 0]} stroke="#17202a" />
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
    <div className="overflow-hidden border-4 border-ink bg-cream">
      <table className="w-full text-left text-sm">
        <tbody>
          {items.map((item) => (
            <tr className="border-t-2 border-ink first:border-t-0" key={item.key}>
              <td className="px-3 py-2 font-black text-ink">
                {prefix}
                {item.label}
              </td>
              <td className="px-3 py-2 text-right font-bold text-ink">{item.clicks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GeoMap({ items }: { items: AnalyticsBreakdownItem[] }) {
  const points = items.map(toMapPoint).filter((item): item is MapPoint => item !== null);

  if (points.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState label="No mappable geolocation yet. New clicks will include CloudFront coordinates when available." />
        <TableList emptyLabel="No city data yet." items={items} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        aria-label="World map showing click locations"
        className="relative overflow-hidden border-4 border-ink bg-sky shadow-retro-sm"
        role="img"
      >
        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em]">
          <span className="border-2 border-ink bg-yellow px-2 py-1 text-ink">Exact</span>
          <span className="border-2 border-ink bg-cream px-2 py-1 text-ink">Approx.</span>
        </div>
        <svg className="h-72 w-full" preserveAspectRatio="none" viewBox="0 0 720 360">
          <defs>
            <pattern height="36" id="map-grid" patternUnits="userSpaceOnUse" width="36">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#2a1a12" strokeOpacity="0.18" />
            </pattern>
          </defs>
          <rect fill="url(#map-grid)" height="360" width="720" />
          <path
            d="M102 144h82l34 34-28 48h-73l-33-34zM270 100h83l49 34-15 52-98 13-43-49zM430 82h137l44 45-32 45H451l-44-39zM476 217h81l30 35-24 38h-76l-28-32zM184 245h73l28 31-32 38h-75l-28-35z"
            fill="#fff8dc"
            stroke="#2a1a12"
            strokeWidth="4"
          />
          {points.slice(0, 12).map((point) => {
            const { x, y } = projectLocation(point.latitude, point.longitude);
            const radius = Math.min(Math.max(point.clicks * 2 + 6, 8), 24);
            return (
              <g key={point.key}>
                <circle
                  cx={x}
                  cy={y}
                  fill={point.isApproximate ? "#fff8dc" : "#d4a03e"}
                  r={radius}
                  stroke="#2a1a12"
                  strokeDasharray={point.isApproximate ? "6 4" : undefined}
                  strokeWidth="4"
                />
                <circle cx={x} cy={y} fill="#2a1a12" r="3" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        {points.slice(0, 6).map((item) => (
          <div className="border-2 border-ink bg-cream px-3 py-2" key={item.key}>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-black text-ink">{item.label}</span>
              <span className="font-black text-ink">{item.clicks}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-ink/70">
              <span>{item.coordinateLabel}</span>
              <span>{item.latitude.toFixed(2)}, {item.longitude.toFixed(2)}</span>
              <span className="border border-ink bg-white px-1 font-black text-ink">
                {item.isApproximate ? "Approx." : "Exact"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type MapPoint = AnalyticsBreakdownItem & {
  coordinateLabel: string;
  isApproximate: boolean;
  latitude: number;
  longitude: number;
};

type HeatmapCell = {
  clicks: number;
  date: Date;
  dateLabel: string;
  label: string;
  level: number;
  week: number;
  weekday: number;
};

type HeatmapMonthLabel = {
  month: string;
  week: number;
};

function buildHeatmapCells(points: AnalyticsPoint[]): HeatmapCell[] {
  const maxClicks = Math.max(...points.map((point) => point.clicks), 0);
  const firstDate = parsePointDate(points[0]?.label);
  if (!firstDate) {
    return [];
  }

  return points.flatMap((point) => {
    const date = parsePointDate(point.label);
    if (!date) {
      return [];
    }
    const dayOffset = daysBetween(firstDate, date);
    return [
      {
        clicks: point.clicks,
        date,
        dateLabel: formatHeatmapDate(date),
        label: point.label,
        level: heatmapLevel(point.clicks, maxClicks),
        week: Math.floor((firstDate.getDay() + dayOffset) / 7),
        weekday: date.getDay(),
      },
    ];
  });
}

function buildMonthLabels(cells: HeatmapCell[]): HeatmapMonthLabel[] {
  const labels: HeatmapMonthLabel[] = [];
  let previousMonth = -1;
  for (const cell of cells) {
    const month = cell.date.getMonth();
    if (month !== previousMonth) {
      labels.push({
        month: monthFormatter.format(cell.date),
        week: cell.week,
      });
      previousMonth = month;
    }
  }
  return labels;
}

function heatmapLevel(clicks: number, maxClicks: number): number {
  if (clicks <= 0 || maxClicks <= 0) {
    return 0;
  }
  const ratio = clicks / maxClicks;
  if (ratio <= 0.25) {
    return 1;
  }
  if (ratio <= 0.5) {
    return 2;
  }
  if (ratio <= 0.75) {
    return 3;
  }
  return 4;
}

function heatmapColor(level: number): string {
  return ["#3b2a20", "#fff8dc", "#b7f7d6", "#d4a03e", "#ffb38a"][level] ?? "#3b2a20";
}

function rangeCopy(range: AnalyticsRange): string {
  if (range === "365d") {
    return "year";
  }
  return `${range.replace("d", "")} days`;
}

function toMapPoint(item: AnalyticsBreakdownItem): MapPoint | null {
  const latitude = Number(item.metadata.latitude);
  const longitude = Number(item.metadata.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return {
      ...item,
      coordinateLabel: item.label,
      isApproximate: false,
      latitude,
      longitude,
    };
  }

  const countryCode = item.metadata.country_code?.toUpperCase();
  const approximate = countryCode ? approximateCoordinates[countryCode] : null;
  if (!approximate) {
    return null;
  }

  return {
    ...item,
    coordinateLabel: approximate.label,
    isApproximate: true,
    latitude: approximate.latitude,
    longitude: approximate.longitude,
  };
}

function EmptyState({ label }: { label: string }) {
  return <p className="border-2 border-dashed border-ink bg-cream p-3 text-sm font-bold text-ink/70">{label}</p>;
}

function shortDate(value: string): string {
  const [, month, day] = value.split("-");
  return month && day ? `${month}/${day}` : value;
}

function parsePointDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function daysBetween(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / 86_400_000);
}

function formatHeatmapDate(value: Date): string {
  return value.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatUpdateTime(value: Date): string {
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function projectLocation(latitude: number, longitude: number): { x: number; y: number } {
  return {
    x: ((longitude + 180) / 360) * 720,
    y: ((90 - latitude) / 180) * 360,
  };
}
