"use client";

import Link from "next/link";
import { useState } from "react";
import { registerTenant } from "@/lib/api";

type RegisterState = "idle" | "submitting" | "success" | "error";

export default function RegisterPage() {
  const [tenantName, setTenantName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Create tenant");
  const [state, setState] = useState<RegisterState>("idle");

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("Creating tenant...");
    try {
      const tenant = await registerTenant({
        tenant_name: tenantName,
        owner_email: ownerEmail,
        password,
      });
      setState("success");
      setPassword("");
      setMessage(`Verify your email for ${tenant.name}, then sign in.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to register tenant.");
    }
  }

  return (
    <section className="retro-card-white mx-auto max-w-xl p-6">
      <p className="inline-flex border-2 border-ink bg-yellow px-2 py-1 text-xs font-black uppercase tracking-[0.14em]">
        Tenant onboarding
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-normal">Create tenant</h1>
      <p className="mt-3 text-sm font-semibold text-ink/70">{message}</p>
      <form className="mt-6 space-y-4" onSubmit={submitRegistration}>
        <label className="block text-sm font-black text-ink">
          Tenant name
          <input
            className="mt-2 min-h-11 w-full border-4 border-ink bg-cream px-3 py-2 font-semibold outline-none focus:ring-4 focus:ring-yellow"
            name="tenant_name"
            onChange={(event) => setTenantName(event.target.value)}
            required
            value={tenantName}
          />
        </label>
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
          Password
          <input
            className="mt-2 min-h-11 w-full border-4 border-ink bg-cream px-3 py-2 font-semibold outline-none focus:ring-4 focus:ring-yellow"
            minLength={12}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            className="retro-button retro-button-primary min-h-11 px-4 py-2 text-sm disabled:opacity-60"
            disabled={state === "submitting"}
            type="submit"
          >
            {state === "submitting" ? "Creating..." : "Create tenant"}
          </button>
          <Link className="font-black underline" href="/login">
            Sign in
          </Link>
        </div>
      </form>
      {state === "success" ? (
        <div className="mt-5 border-4 border-ink bg-vintage-mint p-4 text-sm font-black text-ink">
          <p>Verify your email, then use Login to enter the dashboard.</p>
          <Link
            className="mt-3 inline-flex border-2 border-ink bg-white px-3 py-2 shadow-retro-sm"
            href={`/verify-email?email=${encodeURIComponent(ownerEmail)}`}
          >
            Enter verification code
          </Link>
        </div>
      ) : null}
    </section>
  );
}
