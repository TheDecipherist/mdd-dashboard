# MDD Update: Add `area` Field for Hierarchical Product Grouping

## Context

MDD docs currently have no way to express *where in the product* a feature belongs. The existing fields (`wave`, `initiative`, `depends_on`) encode dev-workflow structure (timeline, sequencing, code dependencies) — not human-spatial structure (what part of the product this is).

When a project has 50+ docs, the dashboard graph becomes unreadable. The fix is a new `area` field that encodes product taxonomy as a breadcrumb path. This enables an "Explorer view" in the dashboard (tree sidebar grouped by area) and makes Kanban/table views scannable.

---

## What `area` Means

`area` is a `>` separated hierarchical path that answers: **"Where in the product would a user navigate to find this feature?"**

```yaml
area: "Website > Auth > Login"
area: "API > Users > Permissions"
area: "CLI > Commands > Init"
area: "Dashboard > Analytics > Charts"
area: "Shared > Error Handling"      # for cross-cutting concerns
```

Rules:
- Level 1 = major product area (`Website`, `API`, `CLI`, `Mobile`, `Shared`)
- Level 2 = feature section or page group (`Auth`, `Checkout`, `Settings`)
- Level 3 = specific screen/feature (`Login`, `Password Reset`, `2FA`) — optional
- Use **user-facing product names**, not code names (`Auth` not `authMiddleware`)
- Cross-cutting docs use `Shared > <concept>`
- 1–3 levels is ideal; never more than 4

---

## Changes Required

Update the following files in `~/.claude/mdd/`. Read each file first, then apply the changes described.

---

### 1. `~/.claude/mdd/mdd-build.md`

**Change A — Phase 3 frontmatter template**

Find the frontmatter block in Phase 3 (it starts with `id:`, `title:`, `edition:` etc.).

Add `area:` as the **third field**, immediately after `title:`:

```yaml
---
id: <NN>-<feature-name>
title: <Feature Title>
area: <Level1 > Level2 > Level3>
edition: <project name or "Both">
depends_on: [...]
source_files:
  - <files that will be created>
routes:
  - <API routes if applicable>
models:
  - <database collections if applicable>
test_files:
  - <test files that will be created>
data_flow: <path to .mdd/audits/flow-*.md, or "greenfield" if skipped>
last_synced: <YYYY-MM-DD>
status: draft
phase: <last completed phase name, or "all" when fully built>
mdd_version: <read from mdd.md frontmatter mdd_version field>
tags: [<4-8 domain-concept keywords>]
known_issues: []
---
```

**Change B — Phase 1 questions**

In the "Always ask" section of Phase 1 questions, add this as the **first question** (before the depends_on question):

> **"What area of the product does this belong to? Use the format `Product Area > Section > Page/Feature` (e.g., `Website > Auth > Login`, `API > Users > Permissions`, `CLI > Commands > Init`). Think in terms of where a user would navigate to find this feature in the product — not what code it touches. If cross-cutting, use `Shared > <concept>`."**

**Change C — After the Phase 1 questions block**

Add this rule paragraph after the question list, before "Wait for all answers before proceeding":

> **`area` consistency rule:** Before accepting the user's `area` answer, scan existing `.mdd/docs/` files for `area:` values already in use. Prefer reusing an existing Level 1 and Level 2 value over inventing a new one. Present the user with a list of existing area roots if any exist (e.g., "Existing areas: Website, API, CLI — does this fit one of those?"). Only introduce a new root if the feature genuinely belongs to a new product area. Never leave `area` blank or use a placeholder.

---

### 2. `~/.claude/mdd/mdd-manage.md`

Find the **SCAN MODE** section (or whatever mode checks for missing/stale fields in existing docs).

Add `area` to the list of required frontmatter fields that scan checks for. The check should:
- Flag any doc where `area` is missing or empty as a **lint warning** (not a blocking error)
- Suggest a value based on the doc's `title`, `tags`, and `depends_on` context
- Output format for missing area:

```
⚠️  LINT  01-some-feature.md
    Missing: area
    Suggested: "Website > Auth"  (inferred from tags: [auth, login])
    Fix: add `area: "Website > Auth"` to frontmatter
```

Also update the **STATUS MODE** summary output: if any docs are missing `area`, include a count at the bottom:

```
⚠️  <N> docs missing `area` field — run /mdd scan to see suggestions
```

---

### 3. `~/.claude/mdd/mdd-audit.md`

Find the section where audit checks frontmatter completeness (drift detection, required fields, etc.).

Add `area` to the required fields list. In the audit output, missing `area` should appear as a **LOW severity** finding:

```
LOW  Missing `area` field
     File: .mdd/docs/<filename>.md
     Impact: Doc will not appear in Explorer view in the dashboard
     Fix: Add `area: "<Level1 > Level2>"` to frontmatter
```

---

### 4. `~/.claude/mdd/mdd-lifecycle.md` (if it handles `reverse-engineer` or `upgrade`)

If this file contains a `reverse-engineer` mode that generates docs from existing source code, add `area` inference logic:

> When reverse-engineering a feature doc, infer `area` from:
> 1. The file path of the source files (e.g., `src/pages/auth/login.tsx` → `Website > Auth > Login`)
> 2. API route paths (e.g., `/api/v1/users/permissions` → `API > Users > Permissions`)
> 3. The feature title and tags as fallback
>
> Always show the inferred `area` to the user and ask for confirmation before writing the doc.

---

## Verification

After making all changes, verify by running:

```
/mdd test-feature-name
```

The Phase 1 questions should now include an `area` question. The generated doc in `.mdd/docs/` should include `area:` as the third frontmatter field.

Also run `/mdd scan` on any existing project with docs — it should now report missing `area` fields with suggestions.

---

## Notes

- `area` is **orthogonal** to `wave`/`initiative` — a doc can have both. `wave` = when it's built, `area` = where it lives in the product.
- The `>` separator was chosen intentionally (not `/`) to avoid confusion with file paths and to match natural breadcrumb language.
- The dashboard Explorer view will parse `area` by splitting on ` > ` to build the tree. Ensure consistent spacing around `>` in all docs.
- This change is **backward compatible** — existing docs without `area` continue to work; they simply won't appear in the Explorer view until `area` is added.
