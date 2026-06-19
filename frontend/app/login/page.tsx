export default function LoginPage() {
  return (
    <section className="max-w-md rounded-lg border border-line bg-white p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Login</h1>
      <p className="mt-3 text-sm text-slate-600">
        Cognito authentication will be connected in Phase 2.
      </p>
      <button className="mt-6 rounded-md bg-teal px-4 py-2 text-sm font-medium text-white">
        Continue
      </button>
    </section>
  );
}
