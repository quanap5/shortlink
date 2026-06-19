"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ApiError, buildShortUrl, createLink } from "@/lib/api";
import { loadAuthConfig } from "@/lib/auth";

export default function CreateLinkPage() {
  const [slug, setSlug] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shortUrl, setShortUrl] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsAuthError(false);
    setShortUrl(null);

    const normalizedSlug = slug.trim().replace(/^\/+/, "");
    const normalizedTargetUrl = targetUrl.trim();
    if (normalizedSlug && normalizedSlug.length < 3) {
      setError("Slug must be at least 3 characters.");
      return;
    }
    try {
      new URL(normalizedTargetUrl);
    } catch {
      setError("Target URL must be a valid absolute URL.");
      return;
    }

    setIsSubmitting(true);
    try {
      const [config, link] = await Promise.all([
        loadAuthConfig(),
        createLink({
          ...(normalizedSlug ? { slug: normalizedSlug } : {}),
          target_url: normalizedTargetUrl,
        }),
      ]);
      setSlug(link.slug);
      setTargetUrl(link.target_url);
      setShortUrl(buildShortUrl(config, link.slug));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create link.");
      setIsAuthError(caught instanceof ApiError && caught.status === 401);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="max-w-xl rounded-lg border border-line bg-white p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Create link</h1>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Slug</span>
          <input
            className="mt-1 w-full rounded-md border border-line px-3 py-2"
            placeholder="optional, e.g. launch"
            name="slug"
            onChange={(event) => setSlug(event.target.value)}
            value={slug}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Target URL</span>
          <input
            className="mt-1 w-full rounded-md border border-line px-3 py-2"
            placeholder="https://example.com"
            name="targetUrl"
            onChange={(event) => setTargetUrl(event.target.value)}
            value={targetUrl}
          />
        </label>
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
            {isAuthError ? (
              <Link className="ml-2 font-medium underline" href="/login">
                Login
              </Link>
            ) : null}
          </div>
        ) : null}
        {shortUrl ? (
          <div className="rounded-md border border-teal/30 bg-mist px-3 py-2 text-sm">
            <p className="font-medium text-slate-800">Short link created</p>
            <a
              className="mt-1 block break-all text-teal underline"
              href={shortUrl}
              rel="noreferrer"
              target="_blank"
            >
              {shortUrl}
            </a>
          </div>
        ) : null}
        <button
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create"}
        </button>
      </form>
    </section>
  );
}
