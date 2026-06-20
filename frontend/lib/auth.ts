export type AuthConfig = {
  apiBaseUrl: string;
  clientId: string;
  cognitoDomain: string;
  logoutUri: string;
  redirectBaseUrl?: string;
  redirectUri: string;
  region: string;
  userPoolId: string;
};

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token?: string;
  token_type: string;
};

type TokenErrorResponse = {
  error?: string;
  error_description?: string;
};

type IdTokenClaims = {
  email?: string;
  exp?: number;
  "custom:role"?: string;
  "custom:tenant_id"?: string;
};

const CONFIG_PATH = "/auth-config.json";
const CODE_VERIFIER_KEY = "shortlink.pkce.codeVerifier";
const OAUTH_STATE_KEY = "shortlink.oauth.state";
const TOKENS_KEY = "shortlink.auth.tokens";

function base64UrlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function loadAuthConfig(): Promise<AuthConfig> {
  const response = await fetch(CONFIG_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Missing auth configuration.");
  }
  return response.json() as Promise<AuthConfig>;
}

export async function createPkcePair(): Promise<{
  challenge: string;
  verifier: string;
}> {
  const randomBytes = new Uint8Array(64);
  crypto.getRandomValues(randomBytes);
  const verifier = base64UrlEncode(randomBytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return {
    challenge: base64UrlEncode(new Uint8Array(digest)),
    verifier,
  };
}

export function saveCodeVerifier(verifier: string): void {
  sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);
}

export function takeCodeVerifier(): string | null {
  const verifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  return verifier;
}

export function createOAuthState(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return base64UrlEncode(randomBytes);
}

export function saveOAuthState(state: string): void {
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
}

export function takeOAuthState(): string | null {
  const state = sessionStorage.getItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  return state;
}

export function buildLoginUrl(config: AuthConfig, challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
  });
  return `${config.cognitoDomain}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  config: AuthConfig,
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const response = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(await readTokenErrorMessage(response));
  }
  return response.json() as Promise<TokenResponse>;
}

export async function readTokenErrorMessage(response: Response): Promise<string> {
  try {
    await response.json() as TokenErrorResponse;
  } catch {
    // Keep the user-facing message intentionally provider-neutral.
  }
  return "Unable to complete sign in. Please try again.";
}

export function saveTokens(tokens: TokenResponse): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function readTokens(): TokenResponse | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as TokenResponse;
  } catch {
    clearTokens();
    return null;
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

export function readAccessToken(): string | null {
  return readTokens()?.access_token ?? null;
}

export function readIdToken(): string | null {
  return readTokens()?.id_token ?? null;
}

export function readTenantIdToken(): string | null {
  const idToken = readIdToken();
  if (!idToken) {
    return null;
  }
  const tenantId = getTenantIdFromIdToken(idToken);
  if (!tenantId || isIdTokenExpired(idToken)) {
    clearTokens();
    return null;
  }
  return idToken;
}

export function buildLogoutUrl(config: AuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  });
  return `${config.cognitoDomain}/logout?${params.toString()}`;
}

export function getEmailFromIdToken(idToken: string): string | null {
  return decodeIdTokenClaims(idToken)?.email ?? null;
}

export function getTenantIdFromIdToken(idToken: string): string | null {
  return decodeIdTokenClaims(idToken)?.["custom:tenant_id"] ?? null;
}

function isIdTokenExpired(idToken: string): boolean {
  const exp = decodeIdTokenClaims(idToken)?.exp;
  if (typeof exp !== "number") {
    return true;
  }
  return exp <= Math.floor(Date.now() / 1000);
}

function decodeIdTokenClaims(idToken: string): IdTokenClaims | null {
  try {
    const [, payload] = idToken.split(".");
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as IdTokenClaims;
  } catch {
    return null;
  }
}
