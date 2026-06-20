"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FormEvent, useState } from "react";
import { ApiError, buildShortUrl, createLink } from "@/lib/api";
import { loadAuthConfig } from "@/lib/auth";
import { CopyButton } from "@/components/CopyButton";

type SlugMode = "auto" | "manual";
type ExpirationMode = "never" | "at" | "after";
type LinkStatus = "active" | "disabled" | "expired";
type RedirectType = 301 | 302 | 307;

const SLUG_PATTERN = /^[a-z0-9-_]{3,64}$/;
const TAG_PATTERN = /^[a-z0-9-_]{1,24}$/;
const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:"]);
const INTERNAL_SUFFIXES = [".internal", ".local", ".localhost", ".lan"];

export default function CreateLinkPage() {
  const [slugMode, setSlugMode] = useState<SlugMode>("auto");
  const [slug, setSlug] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [expirationMode, setExpirationMode] = useState<ExpirationMode>("never");
  const [expireAt, setExpireAt] = useState("");
  const [expireAfterDays, setExpireAfterDays] = useState("30");
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("active");
  const [redirectType, setRedirectType] = useState<RedirectType>(302);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shortUrl, setShortUrl] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsAuthError(false);
    setShortUrl(null);

    const normalizedTargetUrl = targetUrl.trim();
    const normalizedSlug = slug.trim().replace(/^\/+/, "").toLowerCase();
    const parsedTags = parseTags(tagsInput);
    if (parsedTags.error) {
      setError(parsedTags.error);
      return;
    }
    const validationError = validateForm({
      expirationMode,
      expireAfterDays,
      expireAt,
      slug: normalizedSlug,
      slugMode,
      targetUrl: normalizedTargetUrl,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...(slugMode === "manual" ? { slug: normalizedSlug } : {}),
        ...(expirationMode === "at" ? { expire_at: new Date(expireAt).toISOString() } : {}),
        ...(expirationMode === "after"
          ? { expire_after_days: Number.parseInt(expireAfterDays, 10) }
          : {}),
        redirect_type: redirectType,
        status: linkStatus,
        tags: parsedTags.tags,
        target_url: normalizedTargetUrl,
      };
      const [config, link] = await Promise.all([loadAuthConfig(), createLink(payload)]);
      setSlug(link.slug);
      setTargetUrl(link.target_url);
      setShortUrl(buildShortUrl(config, link.slug));
      if (slugMode === "auto") {
        setSlug(link.slug);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create link.");
      setIsAuthError(caught instanceof ApiError && caught.status === 401);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl justify-center">
      <section className="retro-card-white w-full p-6 md:p-8">
        <div className="text-center">
          <p className="inline-flex border-2 border-ink bg-yellow px-2 py-1 text-xs font-black uppercase tracking-[0.14em]">
            Shortener console
          </p>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-normal">Create ShortLink</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-ink/70">
            Generate a TwinQX short URL from a safe public HTTP or HTTPS destination.
          </p>
        </div>

        <form className="mx-auto mt-8 max-w-2xl space-y-6" onSubmit={onSubmit}>
          <Field label="Long URL" helper="Only public http:// or https:// URLs are accepted.">
            <input
              className="retro-input"
              inputMode="url"
              name="targetUrl"
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="https://example.com/docs"
              value={targetUrl}
            />
          </Field>

          <fieldset className="space-y-3">
            <legend className="text-sm font-black text-ink">Slug</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceButton
                checked={slugMode === "auto"}
                label="Auto-generate"
                name="slugMode"
                onChange={() => setSlugMode("auto")}
              />
              <ChoiceButton
                checked={slugMode === "manual"}
                label="Custom slug"
                name="slugMode"
                onChange={() => setSlugMode("manual")}
              />
            </div>
            {slugMode === "manual" ? (
              <Field helper="Lowercase letters, numbers, hyphen, underscore. 3-64 chars." label="Custom slug">
                <input
                  className="retro-input"
                  name="slug"
                  onChange={(event) => setSlug(event.target.value.toLowerCase())}
                  placeholder="launch-2026"
                  value={slug}
                />
              </Field>
            ) : null}
          </fieldset>

          <Field
            helper="Optional. Use comma-separated tags like campaign, docs, launch."
            label="Tags"
          >
            <input
              className="retro-input"
              name="tags"
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="campaign, docs, launch"
              value={tagsInput}
            />
          </Field>

          <fieldset className="space-y-3">
            <legend className="text-sm font-black text-ink">Expiration</legend>
            <div className="grid gap-3 md:grid-cols-3">
              <ChoiceButton
                checked={expirationMode === "never"}
                label="Never expire"
                name="expiration"
                onChange={() => setExpirationMode("never")}
              />
              <ChoiceButton
                checked={expirationMode === "at"}
                label="Expire at"
                name="expiration"
                onChange={() => setExpirationMode("at")}
              />
              <ChoiceButton
                checked={expirationMode === "after"}
                label="After days"
                name="expiration"
                onChange={() => setExpirationMode("after")}
              />
            </div>
            {expirationMode === "at" ? (
              <Field label="Expire at datetime">
                <input
                  className="retro-input"
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(event) => setExpireAt(event.target.value)}
                  type="datetime-local"
                  value={expireAt}
                />
              </Field>
            ) : null}
            {expirationMode === "after" ? (
              <Field label="Expire after days">
                <input
                  className="retro-input"
                  min={1}
                  onChange={(event) => setExpireAfterDays(event.target.value)}
                  type="number"
                  value={expireAfterDays}
                />
              </Field>
            ) : null}
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Link status">
              <select
                className="retro-input"
                onChange={(event) => setLinkStatus(event.target.value as LinkStatus)}
                value={linkStatus}
              >
                <option value="active">active</option>
                <option value="disabled">disabled</option>
                <option value="expired">expired</option>
              </select>
            </Field>
            <Field label="Redirect type">
              <select
                className="retro-input"
                onChange={(event) => setRedirectType(Number(event.target.value) as RedirectType)}
                value={redirectType}
              >
                <option value={301}>301 permanent</option>
                <option value={302}>302 temporary default</option>
                <option value={307}>307 temporary</option>
              </select>
            </Field>
          </div>

          {error ? (
            <div className="border-4 border-ink bg-pink px-3 py-2 text-sm font-bold text-ink">
              {error}
              {isAuthError ? (
                <Link className="ml-2 font-medium underline" href="/login">
                  Login
                </Link>
              ) : null}
            </div>
          ) : null}

          {shortUrl ? (
            <div className="border-4 border-ink bg-vintage-mint px-3 py-2 text-sm">
              <p className="font-black text-ink">Short link created</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <a
                  className="block break-all font-bold text-ink underline"
                  href={shortUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {shortUrl}
                </a>
                <CopyButton label="Copy link" value={shortUrl} />
              </div>
            </div>
          ) : null}

          <div className="flex justify-center">
            <button
              className="retro-button retro-button-primary min-h-11 px-6 py-3 text-sm disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create ShortLink"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  children,
  helper,
  label,
}: {
  children: ReactNode;
  helper?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-ink">{label}</span>
      <div className="mt-1">{children}</div>
      {helper ? <span className="mt-1 block text-xs font-bold text-ink/60">{helper}</span> : null}
    </label>
  );
}

function ChoiceButton({
  checked,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center justify-center border-4 border-ink px-3 py-2 text-sm font-black ${
        checked ? "bg-yellow" : "bg-cream"
      }`}
    >
      <input checked={checked} className="sr-only" name={name} onChange={onChange} type="radio" />
      {label}
    </label>
  );
}

function validateForm({
  expirationMode,
  expireAfterDays,
  expireAt,
  slug,
  slugMode,
  targetUrl,
}: {
  expirationMode: ExpirationMode;
  expireAfterDays: string;
  expireAt: string;
  slug: string;
  slugMode: SlugMode;
  targetUrl: string;
}): string | null {
  const urlError = validateTargetUrl(targetUrl);
  if (urlError) {
    return urlError;
  }
  if (slugMode === "manual" && !SLUG_PATTERN.test(slug)) {
    return "Slug must match ^[a-z0-9-_]{3,64}$.";
  }
  if (expirationMode === "at" && !expireAt) {
    return "Choose an expiration datetime or select never expire.";
  }
  if (expirationMode === "after") {
    const days = Number.parseInt(expireAfterDays, 10);
    if (!Number.isInteger(days) || days < 1) {
      return "expire_after_days must be greater than 0.";
    }
  }
  return null;
}

function parseTags(value: string): { error: string | null; tags: string[] } {
  if (!value.trim()) {
    return { error: null, tags: [] };
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of value.split(",")) {
    const tag = rawTag.trim().toLowerCase();
    if (!TAG_PATTERN.test(tag)) {
      return {
        error: "Tags must use lowercase letters, numbers, hyphen, or underscore.",
        tags: [],
      };
    }
    if (!seen.has(tag)) {
      tags.push(tag);
      seen.add(tag);
    }
  }
  if (tags.length > 10) {
    return { error: "A link can have at most 10 tags.", tags: [] };
  }
  return { error: null, tags };
}

function validateTargetUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Long URL must be a valid absolute URL.";
  }
  if (BLOCKED_SCHEMES.has(parsed.protocol) || !["http:", "https:"].includes(parsed.protocol)) {
    return "Long URL must use http or https.";
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "127.0.0.1" ||
    INTERNAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    isPrivateIpv4(hostname) ||
    (!hostname.includes(".") && !isIpv4(hostname))
  ) {
    return "Long URL cannot use localhost, private IPs, or internal hostnames.";
  }
  return null;
}

function isIpv4(value: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

function isPrivateIpv4(value: string): boolean {
  if (!isIpv4(value)) {
    return false;
  }
  const parts = value.split(".").map((part) => Number.parseInt(part, 10));
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}
