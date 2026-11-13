<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Sales business rules live as pure functions in `src/lib/crm.ts` with tests in `src/lib/crm.test.ts`; UI calls them instead of re-implementing. Why: rules must stay testable.
- Access is by the `employees` allow-list (email → role + branches) enforced with RLS helper functions (`is_staff`, `is_admin`, `can_see_branch`). Why: Google sign-in alone must not grant access.
- Signed-in pages live under `src/routes/_authenticated/`; the shell there provides `useCrm()` (current employee, selected branch, lead card opener). Why: one place for branch filter and lead sheet.
- Work areas share Workspace and source-record metric functions in crm.ts; counts and drilldowns use the same filtered rows. Why: reports must reconcile with the base.
- Patients are unique normalized-phone identities; leads are linked encounters assigned by a database trigger. Why: multiple work areas and repeat visits must not duplicate patients.
- Employee errors are leader-confirmed audited records separate from open tasks, protected by RLS. Why: lateness alone is not a confirmed error.
