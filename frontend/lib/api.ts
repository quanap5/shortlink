import { clearTokens, loadAuthConfig, readAccessToken, type AuthConfig } from "@/lib/auth";

export type LinkResponse = {
  created_at: string;
  created_by: string | null;
  expire_at: string | null;
  redirect_type: 301 | 302 | 307;
  slug: string;
  status: "active" | "disabled" | "expired";
  target_url: string;
  tenant_id: string;
};

export type LinksResponse = {
  links: LinkResponse[];
};

export type CreateLinkInput = {
  expire_after_days?: number;
  expire_at?: string;
  redirect_type?: 301 | 302 | 307;
  slug?: string;
  status?: "active" | "disabled" | "expired";
  target_url: string;
};

export type RegisterTenantInput = {
  owner_email: string;
  password: string;
  tenant_name: string;
};

export type RegisterTenantResponse = {
  name: string;
  owner_email: string;
  status: "pending_verification" | "active" | "failed";
  tenant_id: string;
};

export type ClickEventResponse = {
  browser_family: string;
  country_code: string | null;
  device_family: string;
  occurred_at: string;
  slug: string;
  target_url: string;
};

export type LinkAnalyticsResponse = {
  by_browser: Record<string, number>;
  by_country: Record<string, number>;
  by_device: Record<string, number>;
  recent_events: ClickEventResponse[];
  slug: string;
  total_hits: number;
};

export type AnalyticsLinkSummary = {
  by_browser: Record<string, number>;
  by_country: Record<string, number>;
  by_device: Record<string, number>;
  slug: string;
  total_hits: number;
};

export type AnalyticsLinksResponse = {
  links: AnalyticsLinkSummary[];
};

export type AnalyticsRange = "7d" | "30d" | "90d" | "365d";

export type AnalyticsSummary = {
  active_links: number;
  click_growth_percent: number;
  top_link: string | null;
  top_link_clicks: number;
  total_clicks: number;
  total_links: number;
  unique_visitors: number;
};

export type AnalyticsPoint = {
  clicks: number;
  label: string;
};

export type AnalyticsBreakdownItem = {
  clicks: number;
  key: string;
  label: string;
  metadata: Record<string, string>;
};

export type AnalyticsTimeseriesResponse = {
  points: AnalyticsPoint[];
};

export type AnalyticsBreakdownResponse = {
  items: AnalyticsBreakdownItem[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; message?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (typeof body.message === "string") {
      return body.message;
    }
  } catch {
    // Fall back to the HTTP status text below.
  }
  return response.statusText || "Request failed.";
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readAccessToken();
  if (!token) {
    throw new ApiError("Please sign in before using ShortLink.", 401);
  }

  const config = await loadAuthConfig();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearTokens();
    }
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
}

export async function createLink(input: CreateLinkInput): Promise<LinkResponse> {
  return apiFetch<LinkResponse>("/links", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function registerTenant(
  input: RegisterTenantInput,
): Promise<RegisterTenantResponse> {
  const config = await loadAuthConfig();
  const response = await fetch(`${config.apiBaseUrl}/tenants/register`, {
    body: JSON.stringify(input),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  return response.json() as Promise<RegisterTenantResponse>;
}

export async function listLinks(): Promise<LinkResponse[]> {
  const response = await apiFetch<LinksResponse>("/links");
  return response.links;
}

export async function listAnalyticsLinks(): Promise<AnalyticsLinkSummary[]> {
  const response = await apiFetch<AnalyticsLinksResponse>("/analytics/links");
  return response.links;
}

export async function getLinkAnalytics(slug: string): Promise<LinkAnalyticsResponse> {
  return apiFetch<LinkAnalyticsResponse>(`/links/${encodeURIComponent(slug)}/analytics`);
}

export async function getAnalyticsSummary(range: AnalyticsRange): Promise<AnalyticsSummary> {
  return apiFetch<AnalyticsSummary>(`/analytics/summary?range=${range}`);
}

export async function getAnalyticsTimeseries(range: AnalyticsRange): Promise<AnalyticsPoint[]> {
  const response = await apiFetch<AnalyticsTimeseriesResponse>(
    `/analytics/timeseries?range=${range}`,
  );
  return response.points;
}

export async function getAnalyticsBreakdown(
  dimension: "country" | "city" | "device" | "browser" | "os" | "referrer",
  range: AnalyticsRange,
  limit = 10,
): Promise<AnalyticsBreakdownItem[]> {
  const response = await apiFetch<AnalyticsBreakdownResponse>(
    `/analytics/breakdowns/${dimension}?range=${range}&limit=${limit}`,
  );
  return response.items;
}

export async function getAnalyticsTopLinks(
  range: AnalyticsRange,
  limit = 10,
): Promise<AnalyticsBreakdownItem[]> {
  const response = await apiFetch<AnalyticsBreakdownResponse>(
    `/analytics/top-links?range=${range}&limit=${limit}`,
  );
  return response.items;
}

export async function getAnalyticsMap(range: AnalyticsRange): Promise<AnalyticsBreakdownItem[]> {
  const response = await apiFetch<AnalyticsBreakdownResponse>(`/analytics/map?range=${range}`);
  return response.items;
}

export function buildShortUrl(config: AuthConfig, slug: string): string {
  const baseUrl = config.redirectBaseUrl ?? config.apiBaseUrl;
  return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
}
