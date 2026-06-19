import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const analyticsSource = readFileSync(
  new URL("../components/analytics/AnalyticsDashboard.tsx", import.meta.url),
  "utf8",
);
const registerSource = readFileSync(new URL("../app/register/page.tsx", import.meta.url), "utf8");

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
