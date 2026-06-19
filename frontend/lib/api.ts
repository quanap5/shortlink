import { clearTokens, loadAuthConfig, readAccessToken, type AuthConfig } from "@/lib/auth";

export type LinkResponse = {
  created_at: string;
  created_by: string | null;
  slug: string;
  target_url: string;
  tenant_id: string;
};

export type LinksResponse = {
  links: LinkResponse[];
};

export type CreateLinkInput = {
  slug: string;
  target_url: string;
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

export async function listLinks(): Promise<LinkResponse[]> {
  const response = await apiFetch<LinksResponse>("/links");
  return response.links;
}

export function buildShortUrl(config: AuthConfig, slug: string): string {
  return `${config.apiBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
}
