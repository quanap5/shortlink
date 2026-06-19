"use client";

import { useState } from "react";

export function CopyButton({ label = "Copy", value }: { label?: string; value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1600);
    } catch {
      setStatus("failed");
      window.setTimeout(() => setStatus("idle"), 2200);
    }
  }

  const text = status === "copied" ? "Copied" : status === "failed" ? "Failed" : label;

  return (
    <button
      aria-label={`Copy ${value}`}
      className="retro-button retro-button-secondary min-h-11 shrink-0 px-3 py-2 text-xs"
      onClick={copyValue}
      type="button"
    >
      {text}
    </button>
  );
}
