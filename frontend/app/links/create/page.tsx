export default function CreateLinkPage() {
  return (
    <section className="max-w-xl rounded-lg border border-line bg-white p-6">
      <h1 className="text-2xl font-semibold tracking-normal">Create link</h1>
      <form className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Slug</span>
          <input
            className="mt-1 w-full rounded-md border border-line px-3 py-2"
            placeholder="launch"
            name="slug"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Target URL</span>
          <input
            className="mt-1 w-full rounded-md border border-line px-3 py-2"
            placeholder="https://example.com"
            name="targetUrl"
          />
        </label>
        <button className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white">
          Create
        </button>
      </form>
    </section>
  );
}
