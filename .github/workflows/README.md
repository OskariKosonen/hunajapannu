# Workflows

Seven workflows. Two run on GitHub-hosted runners, five on a self-hosted runner
that is the production VPS.

| Workflow | Trigger | Runner | Does |
|---|---|---|---|
| [`ci.yml`](ci.yml) | push to a non-`main` branch, `workflow_call` | hosted | Lint, build, then boot the API against a real PostgreSQL 16 and assert 131 things about the responses |
| [`deploy.yml`](deploy.yml) | push to `main` | self-hosted | Calls CI, then migrations → pm2 restart → health check → frontend rsync → Pi forwarder update |
| [`ingest-watchdog.yml`](ingest-watchdog.yml) | schedule | hosted | Polls `/api/health` and fails if data has stopped arriving or the clocks have drifted |
| [`vt-enrich.yml`](vt-enrich.yml) | schedule | self-hosted | Looks up captured malware hashes on VirusTotal, 4/min, bounded batch |
| [`pi-diagnostics.yml`](pi-diagnostics.yml) | manual | self-hosted | Read-only look at the Pi. Reads nothing it does not print, prints no secret values |
| [`pi-replay.yml`](pi-replay.yml) | manual | self-hosted | Pushes dead-lettered batches back through the ingest API |
| [`db-inspect.yml`](db-inspect.yml) | manual | self-hosted | Counts and aggregates only. No row values, no dumps |

## Why no `pull_request` trigger

The self-hosted runner is the production VPS: database, API, and an account
with sudo. On a `pull_request` event GitHub runs the workflow file from the
*fork's* head commit, so anyone could fork, rewrite `runs-on` to
`[self-hosted, linux]`, and have their code queued against that machine. Fork
PRs receive no secrets, which does not help much, because arbitrary code as
that user can read the environment file and reach PostgreSQL over the local
socket.

CI therefore triggers on branch pushes instead. A push requires write access
here; a fork's pushes run in the fork, which has no runner registered. So no
workflow in this repository is reachable from outside, as a property of the
configuration rather than of somebody remembering not to click Approve.

The durable fix is deploying from a hosted runner over SSH and removing the
self-hosted runner entirely. Not done yet.

## Deploy safety

Deploy is `workflow_call`-gated on CI, so nothing reaches production that has
not booted against a real database first.

`db/apply-migrations.sh` records every migration with a checksum. A migration
that has already been applied and then edited aborts the run. A migration that
errors fails the deploy, restores the working tree to the previously deployed
revision and leaves the API running on it, so the schema and the running code
never silently disagree. Both behaviours exist because the old deploy loop
ended in `|| echo "(skipped/failed)"` and served an empty table for days.

If the backend does not pass its health check within two minutes, the deploy
rolls the code back on its own and reports a warning rather than a green tick.

The Pi is on residential broadband and may be offline or renumbered. That must
not block a backend release, so the forwarder step warns and skips instead of
failing.

## Secrets

`PI_HOST` and `PI_PORT` are secrets rather than variables on purpose. Actions
logs are public on a public repository, and GitHub masks a secret as `***`
wherever it appears in output while printing a variable verbatim. The Pi is at
a home address.
