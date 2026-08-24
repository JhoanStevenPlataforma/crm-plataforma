# AGENTS.md

## Project Overview

Atomic CRM is a full-featured CRM built with React, shadcn-admin-kit, and Supabase. It provides contact management, task tracking, notes, email capture, and deal management with a Kanban board.

## Development Commands

### Setup
```bash
make install          # Install dependencies (frontend, backend, local Supabase)
make start            # Start full stack with real API (Supabase + Vite dev server)
make stop             # Stop the stack
make start-demo       # Start full-stack with FakeRest data provider
```

### Testing and Code Quality

```bash
make test             # Run unit tests (vitest)
make test-db          # Run the pgTAP database tests (needs local Supabase running)
make typecheck        # Run TypeScript type checking
make lint             # Run ESLint and Prettier checks
```

Database behaviour that lives in SQL — RLS policies, triggers, the task state
machine, the append-only audit trail — is tested with pgTAP under
`supabase/tests/database/`. Enable the extension once on the local instance
(`create extension if not exists pgtap with schema extensions;`) and run
`make test-db`. These tests are the only place a policy regression is caught:
`canAccess` is a UI layer and cannot prove anything about access.

### Building

```bash
make build            # Build production bundle (runs tsc + vite build)
```

### Database Management

The database schema is defined declaratively in `supabase/schemas/` (source of truth). Migrations in `supabase/migrations/` are auto-generated and should generally not be edited directly — but sometimes manual adjustment is needed (e.g., replacing a DROP+CREATE with an ALTER TABLE RENAME for column renames). Function definitions in `02_functions.sql` must use the exact `pg_dump` format (run `npx supabase db dump --local --schema public`) to avoid phantom diffs.

```bash
npx supabase db diff --local -f <name>  # Generate migration from schema changes
npx supabase migration up --local       # Apply migrations locally
npx supabase db push                    # Push migrations to remote
npx supabase db reset --local           # Reset local database (destructive)
```

### Registry (Shadcn Components)

```bash
make registry-gen     # Generate registry.json (runs automatically on pre-commit)
make registry-build   # Build Shadcn registry
```

## Architecture

### Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Routing**: React Router v7
- **Data Fetching**: React Query (TanStack Query)
- **Forms**: React Hook Form
- **Application Logic**: shadcn-admin-kit + ra-core (react-admin headless)
- **UI Components**: Shadcn UI + Radix UI
- **Styling**: Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + REST API + Auth + Storage + Edge Functions)
- **Testing**: Vitest

### Directory Structure

```
src/
├── components/
│   ├── admin/              # Shadcn Admin Kit components (mutable dependency)
│   ├── atomic-crm/         # Main CRM application code (~15,000 LOC)
│   │   ├── activity/       # Activity logs
│   │   ├── companies/      # Company management
│   │   ├── contacts/       # Contact management (includes CSV import/export)
│   │   ├── dashboard/      # Dashboard widgets
│   │   ├── deals/          # Deal pipeline (Kanban)
│   │   ├── filters/        # List filters
│   │   ├── layout/         # App layout components (nav tabs are hardcoded here)
│   │   ├── leads/          # Unqualified prospects + conversion to contact
│   │   ├── login/          # Authentication pages
│   │   ├── misc/           # Shared utilities
│   │   ├── notes/          # Note management
│   │   ├── providers/      # Data providers (Supabase + FakeRest)
│   │   ├── root/           # Root CRM component
│   │   ├── sales/          # Sales team management
│   │   ├── settings/       # Settings page
│   │   ├── simple-list/    # List components
│   │   ├── tags/           # Tag management
│   │   └── tasks/          # Task management
│   ├── supabase/           # Supabase-specific auth components
│   └── ui/                 # Shadcn UI components (mutable dependency)
├── hooks/                  # Custom React hooks
├── lib/                    # Utility functions
└── App.tsx                 # Application entry point

supabase/
├── functions/              # Edge functions (user management, inbound email)
├── migrations/             # Database migrations (auto-generated, do not edit directly)
└── schemas/                # Declarative schema (source of truth for DB structure)
```

### Key Architecture Patterns

For more details, check out the doc/src/content/docs/developers/architecture-choices.mdx document.

#### Mutable Dependencies

The codebase includes mutable dependencies that should be modified directly if needed:
- `src/components/admin/`: Shadcn Admin Kit framework code
- `src/components/ui/`: Shadcn UI components

#### Configuration via `<CRM>` Component

The `src/App.tsx` file renders the `<CRM>` component, which accepts props for domain-specific configuration:
- `contactGender`: Gender options
- `companySectors`: Company industry sectors
- `dealCategories`, `dealStages`, `dealPipelineStatuses`: Deal configuration
- `noteStatuses`: Note status options with colors
- `taskTypes`: Task type options
- `logo`, `title`: Branding
- `lightTheme`, `darkTheme`: Theme customization
- `disableTelemetry`: Opt-out of anonymous usage tracking

#### Database Views

Complex queries are handled via database views to simplify frontend code and reduce HTTP overhead. For example, `contacts_summary` provides aggregated contact data including task counts.

The `nb_*` aggregate columns in `contacts_summary` / `companies_summary` are **scalar subqueries, not a join plus `GROUP BY`**. Grouping over the join forced Postgres to aggregate the whole table before `ORDER BY ... LIMIT` could discard it, which cost ~1 s per list page at 200k contacts. Keep them as subqueries.

#### Roles and Permissions

Every record carries a `sales_id` owner. `public.sales.role` is an enum (`admin` / `manager` / `rep`): a rep only sees the records they own, admins and managers see everything and are the only ones who may reassign. Enforcement lives in the RLS policies (`supabase/schemas/05_policies.sql`); `canAccess` is a UI-only layer. See `doc/src/content/docs/developers/roles-and-permissions.mdx`.

#### Team Budgets

A team's target lives in `public.team_budgets` (one row per period), not in a
column on `teams`: overwriting a number to set the next target would destroy the
only record of the previous one. Periods for one team may not overlap — a GiST
exclusion constraint enforces it, because "the budget containing today" must
resolve to exactly one row or the dashboard reports a figure that changes
between page loads.

Unlike `teams`, which is readable by everyone, **`team_budgets` is admin/manager
only for reads as well as writes**. A rep cannot see any quota, including their
own team's. Changing that is a product decision, not a config toggle: it needs a
second `select` policy joined through `team_members`.

Deals carry their own `team_id` rather than resolving the team through the
owner's membership — a rep in two teams would make the same amount count twice,
and moving a rep between teams would retroactively rewrite closed periods. The
reporting columns are appended to `teams_summary`; `/teams-dashboard` renders
them. That path is deliberately not `/teams/dashboard`, which would collide with
the resource's own `/teams/:id`.

`team_members_summary` is the roster the dashboard drills into. Its deal figures
are scoped to **both** the member's ownership and the team's budget period, so
summing a team's members reproduces that team's totals exactly — a breakdown
that does not reconcile with the total above it discredits the total. Two
columns are deliberately outside that scoping: `nb_contacts` / `nb_companies`
(those records have no team and no period) and `nb_deals_all` (every live deal
the member owns, so the gap against `nb_deals` reveals selling booked to another
team). The roster loads only when a team row is expanded, keeping the dashboard
at two requests rather than one per team.

##### Per-member allocation

A team's target is split between its members in `public.team_member_budgets`,
keyed on **the budget row and the membership row**, never on the team and the
person. Keyed on the budget, opening a new period starts from a blank split
instead of silently restating the last one; keyed on the membership, removing
somebody from the team takes their quota with them, so the roster's quotas
always sum to `teams_summary.allocated_amount`.

Both foreign keys are composite (`(budget_id, team_id)` and
`(team_member_id, team_id)`, against unique constraints added to `team_budgets`
and `team_members` for the purpose). Plain single-column keys would accept one
team's budget paired with another team's member — a row that sums into one
team's allocated total while appearing in no roster, so the first symptom is a
total that contradicts its own breakdown.

The sum is **not** capped at the team budget. Reallocating between two people is
two writes, and a per-row invariant would reject the first one purely for being
first; the UI reports over- and under-allocation instead, which is also the only
layer that can say by how much. Access is admin/manager for reads as well as
writes, exactly like `team_budgets`.

##### Drill-down statistics

`/teams-dashboard/team/:teamId` and `/teams-dashboard/member/:memberId` are the
per-team and per-member detail screens. The member route is keyed on the
`team_members` row, not on the sale: the same rep in two teams has two quotas,
two won amounts and two attainments.

Both read one view, `public.team_deal_stats` — a cube of (team, member, month,
stage) — and fold it two ways in the browser (monthly trend, pipeline by stage).
It is the one reporting view built on `GROUP BY` rather than scalar subqueries,
because it *is* the aggregate: there is no `ORDER BY ... LIMIT` for a premature
grouping to defeat, and both filters the UI applies are grouping columns, so the
predicate reaches the deals scan. It is scoped to the team's current budget
period (calendar year when there is none), so the charts reconcile with the
header above them.

##### Workload, and why it is its own view

`pipeline_amount` counts `stage not in ('won', 'lost')`. It used to be
`<> 'won'`, which booked every dead deal as forecast while the CRM dashboard
excluded them — the two screens reported different pipelines for the same team.
`lost_amount` / `nb_won` / `nb_lost` exist so the losses are reported rather
than merely dropped, and so a win rate has a denominator.

Task figures split by **stock vs flow**, and the split decides where they live:

* **Stock** — open, overdue, due this week. No month, so no cube. Scalar
  counters on `team_members_summary`, and `public.team_workload_summary` for the
  team level.
* **Flow** — created, completed, on time, cycle time. These have a month, so
  they live in the `team_task_stats` cube alongside `team_deal_stats`.

`team_workload_summary` is a **separate view, not four more columns on
`teams_summary`** — measured, not stylistic. As columns there they took the
dashboard's query from 35 ms to 330 ms (4 teams, 40 reps, 200k tasks), and
PostgREST asks for `select=*`, so every reader paid it, including the plain
`/teams` list that shows no task count. It computes all four counters in **one
pass per member** (`count(*) filter (…)`); written as one `in (select sales_id
…)` semi-join across the team the planner chose a full scan of `tasks` per team.
The pass matches no partial index, which is why `tasks_owner_all` exists —
without it the same query takes 1.7 s instead of 215 ms.

`nb_tasks_overdue` is a **subset** of `nb_open_tasks`, never a sibling: anything
stacking the two must subtract first or every late task is drawn twice.
`workloadOf` in `taskWorkload.ts` does that subtraction once, for every caller.

"Open" is counted on the **columns** (`completed_at`/`canceled_at`/`deleted_at`/
`archived_at` all null), not on `task_statuses.is_open`. The two disagree on an
archived task and on a task whose completion was recorded without its status
following; the columns are what every partial index and every task list filter
uses, so the counter matches the list a user lands on.

Tasks hang off their **owner**, resolved through `team_members` — a task has no
team column and no period, exactly like `nb_contacts`. A rep rostered in two
teams counts in both, and none of these figures reconcile with the money above
them. That is deliberate; do not "fix" it.

##### Chart colours

`teamChartTheme.ts` owns one palette for every team chart, and **the key order
is part of it**. Green is the good terminal state (won, completed), blue is in
flight (pipeline, pending, created), red is the bad one (lost, overdue), and a
recessive gray marks a reference (a budget, a target) rather than a category.
Green beside red is the deuteranopia collision, so blue always separates them:
pass keys as green, blue, red. The palette this replaced was three steps of one
teal — `won` against `pipeline` measured ΔE 7.1 for *normal* vision, below the
15 floor, so nobody could reliably tell those two bars apart. Dark mode is a
selected set of steps for the dark surface, not the light palette flipped.

#### Deal Stage History

Moving a deal to another stage on the kanban opens a dialog: the reason and any
supporting files are written with the move by `public.move_deal_stage()`, in one
transaction. Two client writes would be wrong here — the half that survives a
failure is always the one that moved the card, leaving a transition nobody can
account for.

The history row itself is written by the `deals_log_stage_change` trigger, which
fires on **every** path that changes `deals.stage` (kanban, edit form, import).
The RPC hands it the reason through transaction-local settings
(`app.deal_stage_*`, the same idiom `transition_task()` uses), scoped to one deal
id so the kanban's neighbour reindexing cannot inherit somebody else's reason. A
stage change made anywhere else is still recorded, with a null reason — that gap
is deliberate, because a history with silent holes reads as complete when it is
not.

`public.deal_stage_changes` is append-only for users: no insert/update/delete
policy and no grants beyond `select`. Reads follow the deal. The rows reach the
UI through the `timeline_events` view, so the deal timeline needs no extra query.

#### Database Triggers

User data syncs between Supabase's `auth.users` table and the CRM's `sales` table via triggers (see `supabase/schemas/04_triggers.sql`).

#### Edge Functions

Located in `supabase/functions/`:
- User management (creating/updating users, account disabling)
- Inbound email webhook processing

#### Data Providers

Two data providers are available:
1. **Supabase** (default): Production backend using PostgreSQL
2. **FakeRest**: In-browser fake API for development/demos, resets on page reload

When using FakeRest, database views are emulated in the frontend. Test data generators are in `src/components/atomic-crm/providers/fakerest/dataGenerator/`.

#### Filter Syntax

List filters follow the `ra-data-postgrest` convention with operator concatenation: `field_name@operator` (e.g., `first_name@eq`). The FakeRest adapter maps these to FakeRest syntax at runtime.

## Development Workflows

### Path Aliases

The project uses TypeScript path aliases configured in `tsconfig.json` and `components.json`:
- `@/components` → `src/components`
- `@/lib` → `src/lib`
- `@/hooks` → `src/hooks`
- `@/components/ui` → `src/components/ui`

### Adding Custom Fields

When modifying contact or company data structures:
1. Edit the relevant schema file in `supabase/schemas/` (table in `01_tables.sql`, views in `03_views.sql`, etc.)
2. Generate a migration: `npx supabase db diff --local -f <name>`
3. Apply it: `npx supabase migration up --local`
4. Update the sample CSV: `src/components/atomic-crm/contacts/contacts_export.csv`
5. Update the import function: `src/components/atomic-crm/contacts/useContactImport.tsx`
6. If using FakeRest, update data generators in `src/components/atomic-crm/providers/fakerest/dataGenerator/`
7. Don't forget to update the related view (`contacts_summary`, `companies_summary`) in `03_views.sql`
8. Don't forget the export functions
9. Don't forget the contact merge logic

### Running with Test Data

Import `test-data/contacts.csv` via the Contacts page → Import button.

### Git Hooks

- Pre-commit: Automatically runs `make registry-gen` to update `registry.json`

### Accessing Local Services During Development

- Frontend: http://localhost:5173/
- Supabase Dashboard: http://localhost:54323/
- REST API: http://127.0.0.1:54321
- Storage (attachments): http://localhost:54323/project/default/storage/buckets/attachments
- Inbucket (email testing): http://localhost:54324/

## Important Notes

- The codebase is intentionally small (~15,000 LOC in `src/components/atomic-crm`) for easy customization
- Modify files in `src/components/admin` and `src/components/ui` directly - they are meant to be customized
- Unit tests can be added in the `src/` directory (test files are named `*.test.ts` or `*.test.tsx`)
- User deletion is not supported to avoid data loss; use account disabling instead
- Filter operators must be supported by the `supabaseAdapter` when using FakeRest
- Optional terse output for solo work: the `concise-dev` style ships at `.claude/styles/concise-dev.md`. To enable it just for yourself, copy it into `.claude/output-styles/` (or `~/.claude/output-styles/`) and run `/output-style concise-dev`, or set `"outputStyle": "concise-dev"` in your own `.claude/settings.local.json`. It is not enabled in the committed `settings.json`.
