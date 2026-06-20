import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const analyticsSource = readFileSync(
  new URL("../components/analytics/AnalyticsDashboard.tsx", import.meta.url),
  "utf8",
);
const registerSource = readFileSync(new URL("../app/register/page.tsx", import.meta.url), "utf8");
const verifyEmailSource = readFileSync(
  new URL("../app/verify-email/page.tsx", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
const authCallbackSource = readFileSync(
  new URL("../app/auth/callback/page.tsx", import.meta.url),
  "utf8",
);
const authNavSource = readFileSync(
  new URL("../components/AuthNavButton.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(new URL("../components/Shell.tsx", import.meta.url), "utf8");
const linksSource = readFileSync(new URL("../app/links/page.tsx", import.meta.url), "utf8");

test("dashboard stat cards include sketch icons for each metric", () => {
  for (const label of ["Total links icon", "Total clicks icon", "Total tenants icon"]) {
    assert.match(source, new RegExp(`aria-label="${label}"`));
  }
});

test("dashboard stat icon badges animate on hover", () => {
  assert.match(source, /group\/stat/);
  assert.match(source, /group-hover\/stat:-rotate-3/);
  assert.match(source, /group-hover\/stat:-translate-y-1/);
  assert.match(source, /transition-transform/);
});

test("analytics dashboard includes a github-style daily hits heatmap", () => {
  assert.match(analyticsSource, /DailyHitsHeatmap/);
  assert.match(analyticsSource, /value: "365d"/);
  assert.match(analyticsSource, /Daily Hits/);
  assert.match(analyticsSource, /Less/);
  assert.match(analyticsSource, /More/);
  assert.match(analyticsSource, /Daily click activity/);
});

test("register page includes tenant onboarding form", () => {
  assert.match(registerSource, /Create tenant/);
  assert.match(registerSource, /tenant_name/);
  assert.match(registerSource, /owner_email/);
  assert.match(registerSource, /password/);
  assert.match(registerSource, /Verify your email/);
});

test("verify email page submits Cognito confirmation code", () => {
  assert.match(verifyEmailSource, /Verify email/);
  assert.match(verifyEmailSource, /owner_email/);
  assert.match(verifyEmailSource, /confirmation_code/);
  assert.match(apiSource, /verifyTenantEmail/);
  assert.match(apiSource, /\/tenants\/verify-email/);
});

test("auth callback exposes token exchange details and runs once", () => {
  assert.match(authSource, /readTokenErrorMessage/);
  assert.match(authCallbackSource, /hasCompletedLogin/);
});

test("api client sends id token so backend receives tenant claims", () => {
  assert.match(authSource, /readIdToken/);
  assert.match(authSource, /readTenantIdToken/);
  assert.match(apiSource, /readTenantIdToken/);
  assert.doesNotMatch(apiSource, /readAccessToken/);
});

test("auth UI waits for persisted id token before continuing", () => {
  assert.match(authNavSource, /readTenantIdToken/);
  assert.match(authCallbackSource, /isComplete/);
  assert.match(authCallbackSource, /getTenantIdFromIdToken/);
  assert.match(authCallbackSource, /clearTokens/);
});

test("signed-in header shows tenant id from the id token", () => {
  assert.match(authNavSource, /getTenantIdFromIdToken/);
  assert.match(authNavSource, /tenantId/);
  assert.match(authNavSource, /Tenant:/);
});

test("app header remains visible while scrolling", () => {
  assert.match(shellSource, /sticky/);
  assert.match(shellSource, /top-0/);
  assert.match(shellSource, /z-50/);
});

test("links page periodically refreshes analytics counts", () => {
  assert.match(linksSource, /setInterval/);
  assert.match(linksSource, /listAnalyticsLinks/);
  assert.match(linksSource, /clearInterval/);
});

test("create link page supports comma-separated tags", () => {
  const createSource = readFileSync(
    new URL("../app/links/create/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(createSource, /Tags/);
  assert.match(createSource, /parseTags/);
  assert.match(createSource, /tagsInput/);
  assert.match(apiSource, /tags\?: string\[\]/);
});

test("links table displays status and tags columns", () => {
  assert.match(linksSource, /Status/);
  assert.match(linksSource, /Tags/);
  assert.match(linksSource, /StatusBadge/);
  assert.match(linksSource, /TagList/);
});

test("links table supports sorting by slug created clicks and status", () => {
  assert.match(linksSource, /type SortKey/);
  assert.match(linksSource, /sortKey/);
  assert.match(linksSource, /sortDirection/);
  assert.match(linksSource, /sortedLinks/);
  for (const key of ["slug", "created_at", "clicks", "status"]) {
    assert.match(linksSource, new RegExp(key));
  }
});

test("links table paginates larger result sets", () => {
  assert.match(linksSource, /pageSize/);
  assert.match(linksSource, /currentPage/);
  assert.match(linksSource, /paginatedLinks/);
  assert.match(linksSource, /PaginationControls/);
});
