"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { verifyTenantEmail } from "@/lib/api";

type VerifyState = "idle" | "submitting" | "success" | "error";

export default function VerifyEmailPage() {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [message, setMessage] = useState("Enter the code from your verification email.");
  const [state, setState] = useState<VerifyState>("idle");

  useEffect(() => {
    const email = new URLSearchParams(window.location.search).get("email");
    if (email) {
      setOwnerEmail(email);
    }
  }, []);

  async function submitVerification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("Verifying email...");
    try {
      await verifyTenantEmail({
        owner_email: ownerEmail,
        confirmation_code: confirmationCode,
      });
      setState("success");
      setConfirmationCode("");
      setMessage("Email verified. You can now sign in.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to verify email.");
    }
  }

  return (
    <section className="retro-card-white mx-auto max-w-xl p-6">
      <p className="inline-flex border-2 border-ink bg-vintage-mint px-2 py-1 text-xs font-black uppercase tracking-[0.14em]">
        Tenant onboarding
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-normal">Verify email</h1>
      <p className="mt-3 text-sm font-semibold text-ink/70">{message}</p>
      <form className="mt-6 space-y-4" onSubmit={submitVerification}>
        <label className="block text-sm font-black text-ink">
          Owner email
          <input
            className="mt-2 min-h-11 w-full border-4 border-ink bg-cream px-3 py-2 font-semibold outline-none focus:ring-4 focus:ring-yellow"
            name="owner_email"
            onChange={(event) => setOwnerEmail(event.target.value)}
            required
            type="email"
            value={ownerEmail}
          />
        </label>
        <label className="block text-sm font-black text-ink">
          Verification code
          <input
            autoComplete="one-time-code"
            className="mt-2 min-h-11 w-full border-4 border-ink bg-cream px-3 py-2 font-semibold tracking-[0.2em] outline-none focus:ring-4 focus:ring-yellow"
            inputMode="numeric"
            name="confirmation_code"
            onChange={(event) => setConfirmationCode(event.target.value)}
            required
            value={confirmationCode}
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            className="retro-button retro-button-primary min-h-11 px-4 py-2 text-sm disabled:opacity-60"
            disabled={state === "submitting"}
            type="submit"
          >
            {state === "submitting" ? "Verifying..." : "Verify email"}
          </button>
          <Link className="font-black underline" href="/login">
            Sign in
          </Link>
        </div>
      </form>
      {state === "success" ? (
        <div className="mt-5 border-4 border-ink bg-vintage-mint p-4 text-sm font-black text-ink">
          Email verified. Use Login to enter the dashboard.
        </div>
      ) : null}
    </section>
  );
}
