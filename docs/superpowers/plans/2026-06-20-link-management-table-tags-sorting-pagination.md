# Link Management Table Tags Sorting Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MVP link management improvements: tags during link creation, status/tags columns in the Links table, sortable columns, and client-side pagination for larger link lists.

**Architecture:** Persist `tags` on the existing tenant-scoped Link model and DynamoDB item, then expose tags through the existing `/links` create/list APIs. Keep sorting and pagination client-side for Phase 1 to avoid DynamoDB index churn; the frontend already loads all tenant links and analytics summaries for the table.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2, DynamoDB repository abstraction, pytest, ruff, Next.js, TypeScript, Tailwind.

---

## File Structure

- Modify `backend/app/domain/models.py`: add `tags` to the `Link` dataclass.
- Modify `backend/app/schemas/links.py`: add `tags` to create/response schemas and normalize/validate tags.
- Modify `backend/app/services/links.py`: pass tags through `LinkCreationService.create_link`.
- Modify `backend/app/api/routes.py`: pass `payload.tags` into the service.
- Modify `backend/app/repositories/dynamodb.py`: persist and read `tags`.
- Modify `backend/app/repositories/memory.py`: ensure in-memory repository keeps tags via the domain model.
- Modify `backend/tests/test_link_services.py`: add service-level tag validation tests.
- Modify `backend/tests/test_dynamodb_repositories.py`: add persistence test for tags.
- Modify `frontend/lib/api.ts`: add `tags` to `CreateLinkInput` and `LinkResponse`.
- Modify `frontend/app/links/create/page.tsx`: add comma-separated tag input and validation.
- Modify `frontend/app/links/page.tsx`: add status/tags columns, sorting state, and pagination state.
- Modify `frontend/tests/dashboard-icons.test.mjs`: add source-level regression coverage for the new frontend UI.

---

### Task 1: Backend Link Tags

**Files:**
- Modify: `backend/app/domain/models.py`
- Modify: `backend/app/schemas/links.py`
- Modify: `backend/app/services/links.py`
- Modify: `backend/app/api/routes.py`
- Modify: `backend/app/repositories/dynamodb.py`
- Test: `backend/tests/test_link_services.py`
- Test: `backend/tests/test_dynamodb_repositories.py`

- [ ] **Step 1: Write failing service tests for tags**

Append these tests to `backend/tests/test_link_services.py`:

```python
def test_create_link_stores_normalized_tags() -> None:
    links = InMemoryLinkRepository()
    service = LinkCreationService(links)

    link = service.create_link(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        tags=[" Docs ", "LAUNCH", "docs", "campaign-1"],
    )

    assert link.tags == ["docs", "launch", "campaign-1"]
    assert links.get("tenant-a", "docs") == link


@pytest.mark.parametrize(
    "tags",
    [
        ["bad tag"],
        ["bad.tag"],
        ["x" * 25],
        [""],
        [f"tag-{index}" for index in range(11)],
    ],
)
def test_create_link_rejects_invalid_tags(tags: list[str]) -> None:
    service = LinkCreationService(InMemoryLinkRepository())

    with pytest.raises(ValueError):
        service.create_link(
            tenant_id="tenant-a",
            slug="docs",
            target_url="https://example.com/docs",
            tags=tags,
        )
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend\tests\test_link_services.py -q
```

Expected: fail because `LinkCreationService.create_link()` does not accept `tags`.

- [ ] **Step 3: Add tags to the domain model**

In `backend/app/domain/models.py`, update `Link`:

```python
@dataclass(frozen=True)
class Link:
    tenant_id: str
    slug: str
    target_url: str
    created_at: datetime
    created_by: str | None = None
    expire_at: datetime | None = None
    status: LinkStatus = "active"
    redirect_type: RedirectType = 302
    tags: list[str] | None = None
```

Use `list[str] | None` to avoid a mutable dataclass default. The service will normalize this to a list before constructing the model.

- [ ] **Step 4: Implement tag normalization in the service**

In `backend/app/services/links.py`, add constants near `SLUG_PATTERN`:

```python
TAG_PATTERN = re.compile(r"^[a-z0-9-_]{1,24}$")
MAX_TAGS_PER_LINK = 10
```

Update `LinkCreationService.create_link()` signature:

```python
        tags: list[str] | None = None,
```

Before creating `Link`, add:

```python
        normalized_tags = normalize_tags(tags)
```

Pass tags into `Link`:

```python
            tags=normalized_tags,
```

Add helper near `normalize_slug()`:

```python
def normalize_tags(tags: list[str] | None) -> list[str]:
    if not tags:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        value = tag.strip().lower()
        if not TAG_PATTERN.fullmatch(value):
            raise ValueError("Tags must match ^[a-z0-9-_]{1,24}$.")
        if value not in seen:
            normalized.append(value)
            seen.add(value)
    if len(normalized) > MAX_TAGS_PER_LINK:
        raise ValueError("A link can have at most 10 tags.")
    return normalized
```

- [ ] **Step 5: Add tags to Pydantic schemas**

In `backend/app/schemas/links.py`, add to `CreateLinkRequest`:

```python
    tags: list[str] = Field(default_factory=list, max_length=10)
```

Add this validator:

```python
    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for tag in value:
            normalized_tag = tag.strip().lower()
            if normalized_tag not in seen:
                normalized.append(normalized_tag)
                seen.add(normalized_tag)
        return normalized
```

Add to `LinkResponse`:

```python
    tags: list[str] = Field(default_factory=list)
```

Keep detailed tag regex validation in the service so business rules stay out of API handlers.

- [ ] **Step 6: Pass tags through the API route**

In `backend/app/api/routes.py`, add `tags=payload.tags` in `create_link()`:

```python
        link = service.create_link(
            tenant_id=tenant_id,
            slug=payload.slug,
            target_url=payload.target_url,
            expire_at=payload.expire_at,
            expire_after_days=payload.expire_after_days,
            status=payload.status,
            redirect_type=payload.redirect_type,
            tags=payload.tags,
        )
```

- [ ] **Step 7: Persist tags in DynamoDB**

In `backend/app/repositories/dynamodb.py`, add `"tags": link.tags or []` to `DynamoDBLinkRepository.create()` item:

```python
            "tags": link.tags or [],
```

In `_link_from_item()`, add:

```python
        tags=[str(tag) for tag in item.get("tags", [])],
```

- [ ] **Step 8: Add DynamoDB repository test for tags**

Append to `backend/tests/test_dynamodb_repositories.py`:

```python
from app.repositories.dynamodb import DynamoDBClickEventRepository, DynamoDBLinkRepository


def test_link_repository_persists_tags() -> None:
    resource = FakeDynamoDBResource()
    repository = DynamoDBLinkRepository("links", dynamodb_resource=resource)
    link = Link(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        created_at=datetime(2026, 6, 20, tzinfo=UTC),
        tags=["docs", "launch"],
    )

    repository.create(link)

    assert resource.table.item is not None
    assert resource.table.item["tags"] == ["docs", "launch"]
```

If the file currently imports only `ClickEvent`, also import `Link` from `app.domain.models`.

- [ ] **Step 9: Run backend tests and verify GREEN**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend\tests\test_link_services.py backend\tests\test_dynamodb_repositories.py -q
```

Expected: all selected tests pass.

---

### Task 2: Frontend Create Tags

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/app/links/create/page.tsx`
- Test: `frontend/tests/dashboard-icons.test.mjs`

- [ ] **Step 1: Write failing frontend source test**

Append to `frontend/tests/dashboard-icons.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: fail because `tagsInput`, `parseTags`, and API tags type do not exist.

- [ ] **Step 3: Add tags to API types**

In `frontend/lib/api.ts`, add to `LinkResponse`:

```typescript
  tags: string[];
```

Add to `CreateLinkInput`:

```typescript
  tags?: string[];
```

- [ ] **Step 4: Add tag input state and payload**

In `frontend/app/links/create/page.tsx`, add state near other form state:

```typescript
  const [tagsInput, setTagsInput] = useState("");
```

In `onSubmit()`, compute tags before validation:

```typescript
    const parsedTags = parseTags(tagsInput);
```

Include `tags: parsedTags.tags` in `validateForm()` input and payload:

```typescript
      tags: parsedTags.tags,
```

If `parsedTags.error` is set, display it and return before submit:

```typescript
    if (parsedTags.error) {
      setError(parsedTags.error);
      return;
    }
```

Add to payload:

```typescript
        tags: parsedTags.tags,
```

- [ ] **Step 5: Add Tags field to the form**

Place after the Slug fieldset:

```tsx
          <Field
            label="Tags"
            helper="Optional. Use comma-separated tags like campaign, docs, launch."
          >
            <input
              className="retro-input"
              name="tags"
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="campaign, docs, launch"
              value={tagsInput}
            />
          </Field>
```

- [ ] **Step 6: Add tag parser helper**

At the bottom of `frontend/app/links/create/page.tsx`, add:

```typescript
const TAG_PATTERN = /^[a-z0-9-_]{1,24}$/;

function parseTags(value: string): { error: string | null; tags: string[] } {
  if (!value.trim()) {
    return { error: null, tags: [] };
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of value.split(",")) {
    const tag = rawTag.trim().toLowerCase();
    if (!TAG_PATTERN.test(tag)) {
      return { error: "Tags must use lowercase letters, numbers, hyphen, or underscore." , tags: [] };
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
```

- [ ] **Step 7: Run frontend tests and verify GREEN**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: all frontend source tests pass.

---

### Task 3: Links Table Status and Tags Columns

**Files:**
- Modify: `frontend/app/links/page.tsx`
- Test: `frontend/tests/dashboard-icons.test.mjs`

- [ ] **Step 1: Write failing frontend source test**

Append to `frontend/tests/dashboard-icons.test.mjs`:

```javascript
test("links table displays status and tags columns", () => {
  const linksSource = readFileSync(new URL("../app/links/page.tsx", import.meta.url), "utf8");
  assert.match(linksSource, /Status/);
  assert.match(linksSource, /Tags/);
  assert.match(linksSource, /StatusBadge/);
  assert.match(linksSource, /TagList/);
});
```

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: fail because `StatusBadge` and `TagList` do not exist.

- [ ] **Step 3: Add table headers**

In `frontend/app/links/page.tsx`, update table headers:

```tsx
              <th className="border-b-4 border-ink px-4 py-3 font-black">Slug</th>
              <th className="border-b-4 border-ink px-4 py-3 font-black">Target URL</th>
              <th className="border-b-4 border-ink px-4 py-3 font-black">Status</th>
              <th className="border-b-4 border-ink px-4 py-3 font-black">Tags</th>
              <th className="border-b-4 border-ink px-4 py-3 text-right font-black">Clicks</th>
              <th className="border-b-4 border-ink px-4 py-3 font-black">Created</th>
```

Update every `colSpan={4}` in this table to `colSpan={6}`.

- [ ] **Step 4: Render status and tags cells**

Inside the row render, add after Target URL cell:

```tsx
                <td className="px-4 py-3">
                  <StatusBadge status={link.status} />
                </td>
                <td className="px-4 py-3">
                  <TagList tags={link.tags ?? []} />
                </td>
```

- [ ] **Step 5: Add display helper components**

At the bottom of `frontend/app/links/page.tsx`, add:

```tsx
function StatusBadge({ status }: { status: LinkResponse["status"] }) {
  const className =
    status === "active"
      ? "bg-vintage-mint"
      : status === "disabled"
        ? "bg-pink"
        : "bg-cream";
  return (
    <span className={`inline-flex border-2 border-ink px-2 py-1 text-xs font-black uppercase ${className}`}>
      {status}
    </span>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-xs font-bold text-ink/50">No tags</span>;
  }
  return (
    <div className="flex max-w-xs flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          className="border-2 border-ink bg-yellow px-2 py-0.5 text-xs font-black"
          key={tag}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run frontend tests and verify GREEN**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: all frontend tests pass.

---

### Task 4: Links Table Sorting

**Files:**
- Modify: `frontend/app/links/page.tsx`
- Test: `frontend/tests/dashboard-icons.test.mjs`

- [ ] **Step 1: Write failing frontend source test**

Append to `frontend/tests/dashboard-icons.test.mjs`:

```javascript
test("links table supports sorting by slug created clicks and status", () => {
  const linksSource = readFileSync(new URL("../app/links/page.tsx", import.meta.url), "utf8");
  assert.match(linksSource, /type SortKey/);
  assert.match(linksSource, /sortKey/);
  assert.match(linksSource, /sortDirection/);
  assert.match(linksSource, /sortedLinks/);
  for (const key of ["slug", "created_at", "clicks", "status"]) {
    assert.match(linksSource, new RegExp(key));
  }
});
```

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: fail because sorting state and `sortedLinks` do not exist.

- [ ] **Step 3: Add sort state and types**

In `frontend/app/links/page.tsx`, add after imports:

```typescript
type SortKey = "slug" | "created_at" | "clicks" | "status";
type SortDirection = "asc" | "desc";
```

Inside component state:

```typescript
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
```

- [ ] **Step 4: Add sort helper and computed sorted links**

Inside component before `return`:

```typescript
  function updateSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "created_at" || nextKey === "clicks" ? "desc" : "asc");
  }

  const sortedLinks = [...links].sort((left, right) => {
    const direction = sortDirection === "asc" ? 1 : -1;
    if (sortKey === "clicks") {
      return ((analytics[left.slug]?.total_hits ?? 0) - (analytics[right.slug]?.total_hits ?? 0)) * direction;
    }
    if (sortKey === "created_at") {
      return (new Date(left.created_at).getTime() - new Date(right.created_at).getTime()) * direction;
    }
    return left[sortKey].localeCompare(right[sortKey]) * direction;
  });
```

- [ ] **Step 5: Add sortable header buttons**

Replace the plain headers for Slug, Status, Clicks, Created with buttons:

```tsx
<SortableHeader
  active={sortKey === "slug"}
  direction={sortDirection}
  label="Slug"
  onClick={() => updateSort("slug")}
/>
```

Use the same helper for:

```tsx
<SortableHeader active={sortKey === "status"} direction={sortDirection} label="Status" onClick={() => updateSort("status")} />
<SortableHeader active={sortKey === "clicks"} direction={sortDirection} label="Clicks" onClick={() => updateSort("clicks")} align="right" />
<SortableHeader active={sortKey === "created_at"} direction={sortDirection} label="Created" onClick={() => updateSort("created_at")} />
```

Leave Target URL and Tags as non-sortable for MVP.

- [ ] **Step 6: Add SortableHeader component**

At bottom of `frontend/app/links/page.tsx`, add:

```tsx
function SortableHeader({
  active,
  align = "left",
  direction,
  label,
  onClick,
}: {
  active: boolean;
  align?: "left" | "right";
  direction: SortDirection;
  label: string;
  onClick: () => void;
}) {
  return (
    <th className={`border-b-4 border-ink px-4 py-3 font-black ${align === "right" ? "text-right" : ""}`}>
      <button
        className="inline-flex items-center gap-1 font-black uppercase"
        onClick={onClick}
        type="button"
      >
        {label}
        <span aria-hidden="true">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}
```

- [ ] **Step 7: Render sorted links**

Change:

```tsx
{links.map((link) => (
```

to:

```tsx
{sortedLinks.map((link) => (
```

- [ ] **Step 8: Run frontend tests and verify GREEN**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: all frontend tests pass.

---

### Task 5: Links Table Pagination

**Files:**
- Modify: `frontend/app/links/page.tsx`
- Test: `frontend/tests/dashboard-icons.test.mjs`

- [ ] **Step 1: Write failing frontend source test**

Append to `frontend/tests/dashboard-icons.test.mjs`:

```javascript
test("links table paginates larger result sets", () => {
  const linksSource = readFileSync(new URL("../app/links/page.tsx", import.meta.url), "utf8");
  assert.match(linksSource, /pageSize/);
  assert.match(linksSource, /currentPage/);
  assert.match(linksSource, /paginatedLinks/);
  assert.match(linksSource, /PaginationControls/);
});
```

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: fail because pagination state and controls do not exist.

- [ ] **Step 3: Add pagination state**

Inside `LinkListPage()` state:

```typescript
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
```

- [ ] **Step 4: Reset page on sort or page size changes**

Inside `updateSort()`, add before changing sort:

```typescript
    setCurrentPage(1);
```

Add a page size change handler:

```typescript
  function updatePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setCurrentPage(1);
  }
```

- [ ] **Step 5: Add computed paginated links**

After `sortedLinks`:

```typescript
  const totalPages = Math.max(1, Math.ceil(sortedLinks.length / pageSize));
  const boundedCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (boundedCurrentPage - 1) * pageSize;
  const paginatedLinks = sortedLinks.slice(pageStart, pageStart + pageSize);
```

Add this effect to keep current page bounded after refresh:

```typescript
  useEffect(() => {
    const total = Math.max(1, Math.ceil(links.length / pageSize));
    if (currentPage > total) {
      setCurrentPage(total);
    }
  }, [currentPage, links.length, pageSize]);
```

- [ ] **Step 6: Render paginated links**

Change:

```tsx
{sortedLinks.map((link) => (
```

to:

```tsx
{paginatedLinks.map((link) => (
```

- [ ] **Step 7: Add pagination controls under table**

After `</table>` and before the table wrapper closing `</div>`, add:

```tsx
        <PaginationControls
          currentPage={boundedCurrentPage}
          onNext={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
          onPageSizeChange={updatePageSize}
          onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
          pageSize={pageSize}
          totalItems={sortedLinks.length}
          totalPages={totalPages}
        />
```

- [ ] **Step 8: Add PaginationControls component**

At bottom of `frontend/app/links/page.tsx`, add:

```tsx
function PaginationControls({
  currentPage,
  onNext,
  onPageSizeChange,
  onPrevious,
  pageSize,
  totalItems,
  totalPages,
}: {
  currentPage: number;
  onNext: () => void;
  onPageSizeChange: (pageSize: number) => void;
  onPrevious: () => void;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}) {
  const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  return (
    <div className="flex flex-col gap-3 border-t-4 border-ink bg-cream px-4 py-3 text-sm font-bold sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {firstItem}-{lastItem} of {totalItems}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="border-2 border-ink bg-white px-2 py-1 font-black"
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          value={pageSize}
        >
          <option value={10}>10 rows</option>
          <option value={25}>25 rows</option>
          <option value={50}>50 rows</option>
        </select>
        <button
          className="retro-button retro-button-secondary min-h-10 px-3 py-1 text-xs disabled:opacity-50"
          disabled={currentPage <= 1}
          onClick={onPrevious}
          type="button"
        >
          Previous
        </button>
        <span className="font-black">
          Page {currentPage} / {totalPages}
        </span>
        <button
          className="retro-button retro-button-secondary min-h-10 px-3 py-1 text-xs disabled:opacity-50"
          disabled={currentPage >= totalPages}
          onClick={onNext}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run frontend tests and verify GREEN**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: all frontend tests pass.

---

### Task 6: Full Verification and Deploy

**Files:**
- No new source files expected.
- Verify all changed backend/frontend/infra files.

- [ ] **Step 1: Run backend lint**

Run:

```powershell
.\.venv\Scripts\ruff.exe check backend
```

Expected: `All checks passed!`

- [ ] **Step 2: Run backend tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend\tests
```

Expected: all tests pass.

- [ ] **Step 3: Run frontend tests**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: all frontend tests pass.

- [ ] **Step 4: Run frontend lint and build**

Run:

```powershell
cd frontend
npm.cmd run lint
npm.cmd run build
```

Expected: no lint errors and Next.js static export succeeds.

- [ ] **Step 5: Run infra build**

Run:

```powershell
cd infra
npm.cmd run build
```

Expected: TypeScript compile succeeds.

- [ ] **Step 6: Deploy**

Run:

```powershell
cd infra
npx.cmd cdk deploy --require-approval never
```

Expected: `ShortLinkStack` finishes with `UPDATE_COMPLETE`.

- [ ] **Step 7: Production smoke test**

Open `https://link.twinqx.com/links` after login and verify:

- Status column appears.
- Tags column appears.
- Existing links without tags show `No tags`.
- Sort headers toggle direction.
- Pagination controls show `Showing X-Y of Z`.
- Creating a link with `campaign, docs` tags displays those tags in the table after refresh.

---

## Self-Review

- Spec coverage: all requested features are covered: status column, create tags, sorting, and pagination.
- Scope check: sorting and pagination are intentionally client-side for MVP; no new DynamoDB indexes or API query contracts are introduced.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: backend and frontend both use `tags: list[str]` / `tags: string[]`; link status continues to use existing `active | disabled | expired`.
