# Zwart op Wit — operational notes

## Environments

- **Production**: `main` branch, auto-deploys to Railway. Public URL
  `https://zwartopwit.up.railway.app`. Custom domain
  `https://internal.zwartopwit.org` also points at the same production
  service — not reachable from this sandbox's egress proxy, so verify
  deploys there via `zwartopwit.up.railway.app` instead and have the user
  confirm on the custom domain themselves.
- **Staging**: `staging` branch, auto-deploys to Railway. URL
  `https://zwartopklad.up.railway.app`. Own Postgres, separate from
  production.
- Both expose `/api/commit.txt` with the deployed commit SHA — poll that to
  confirm a deploy landed rather than guessing from timing.

## Workflow

- **Every new piece of work gets its own topic branch off `main`** — never
  pile unrelated features onto one shared long-lived branch. Name it for
  what it does (e.g. `value-graph`, `fix-dropdown-clipping`).
  - Exception: a Claude Code cloud session may be bound by its own
    environment to a session-assigned branch (e.g. `claude/<session-id>`)
    that it's required to push to. Treat that as the session's own branch,
    not a home for every feature — still cut real topic branches for actual
    work and PR them in; only fall back to the assigned branch if the
    session setup leaves no other option.
- PR the topic branch into `staging` to deploy it for review.
- Only promote `staging` → `main` (production) on explicit user approval —
  never on your own initiative.
- Promote via a GitHub PR (`staging` → `main`), squash-merged — matches the
  existing commit history style (`#97`, `#98`, …).
- After a squash-merge promotion, delete the merged topic branch (its
  history is now folded into `main`); don't reuse or reset it for the next
  piece of work.
- **Squash-merge drift**: once a PR squash-merges into `main`, `staging`'s
  own pre-squash commits have different SHAs than what's now on `main`,
  even though the content is identical — GitHub will then report a *later*
  PR from a fresh topic branch (cut from `main`) into `staging` as having
  merge conflicts, even when there's no real content conflict. Fix: confirm
  it's pure drift (`git diff origin/main origin/staging` should be empty),
  then resync `staging` to `main` — `git push origin origin/main:staging
  --force-with-lease` — and retry the merge.
