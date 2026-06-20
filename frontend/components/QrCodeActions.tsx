"use client";

import { useEffect, useState } from "react";
import { downloadLinkQr, fetchLinkQr, type QrFormat } from "@/lib/api";

type QrCodeActionsProps = {
  slug: string;
};

export function QrCodeActions({ slug }: QrCodeActionsProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function previewQr() {
    setError(null);
    setIsLoading(true);
    try {
      const blob = await fetchLinkQr(slug, "svg");
      const nextPreviewUrl = URL.createObjectURL(blob);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return nextPreviewUrl;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load QR preview.");
    } finally {
      setIsLoading(false);
    }
  }

  async function downloadQr(format: QrFormat) {
    setError(null);
    setIsLoading(true);
    try {
      const blob = await downloadLinkQr(slug, format);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${slug}-qr.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to download ${format}.`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className="border-2 border-ink bg-cream px-2 py-1 text-xs font-black uppercase transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-yellow disabled:opacity-50"
          disabled={isLoading}
          onClick={previewQr}
          type="button"
        >
          Preview QR
        </button>
        <button
          className="border-2 border-ink bg-white px-2 py-1 text-xs font-black uppercase transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-yellow disabled:opacity-50"
          disabled={isLoading}
          onClick={() => downloadQr("png")}
          type="button"
        >
          Download PNG
        </button>
        <button
          className="border-2 border-ink bg-white px-2 py-1 text-xs font-black uppercase transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-yellow disabled:opacity-50"
          disabled={isLoading}
          onClick={() => downloadQr("svg")}
          type="button"
        >
          Download SVG
        </button>
      </div>
      {previewUrl ? (
        <div className="inline-flex border-4 border-ink bg-white p-2 shadow-retro">
          {/* eslint-disable-next-line @next/next/no-img-element -- Authenticated blob URLs cannot use next/image optimization. */}
          <img alt={`QR code for /${slug}`} className="h-28 w-28" src={previewUrl} />
        </div>
      ) : null}
      {error ? <p className="text-xs font-black text-terracotta">{error}</p> : null}
    </div>
  );
}
