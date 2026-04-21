# Harvester — cloud architecture options

**Status:** ✅ **DECIDED 2026-04-21: Option D (supervised session-only)**. See [Decision](#decision) at the bottom. Options A/B/C kept in this doc as reference in case constraints change later.
**Context:** Sprint 3.33 S2 shipped a local launchd pattern for the omnichannel harvester. Peter wants cloud-first execution with supervised-session runs as a fallback — the launchd pattern has been uninstalled. This doc lays out the viable hosts for the harvester + Beeper runtime.

## The hard constraint

Beeper Desktop API is a wrapper around a Beeper-Desktop-the-GUI-app process. The API is localhost-only by default (`remote_access:false`), but the root requirement is: **some process, somewhere, must be running Beeper Desktop with Peter's account logged in**, because Beeper's account-to-bridge authentication lives inside the app. There is no stateless REST endpoint that takes a username+password and returns messages.

The options below differ only in where that "somewhere" lives.

---

## Option A — Mac as data source + Cloud Run as orchestrator (Tailscale)

```
  [Peter's Mac]                      [GCP]
    Beeper Desktop                     Cloud Scheduler (hourly)
      ↓ localhost:23373                    ↓
    Tailscale tailnet                  Cloud Run Job
      ↓                                    ↓ calls http://<mac-tailnet>:23373
      ←──── tailnet socket ────────────────┘
                                       ↓ writes
                                     GCS: data/interactions/*.jsonl
```

- **Peter does:** install Tailscale on Mac + Cloud Run (container sidecar), keep Beeper running when he wants harvest to succeed.
- **Runtime:** Cloud Run Job (same project), scheduled via existing Cloud Scheduler. Reuses `main.py harvest-messages --incremental`. Only new piece: `BEEPER_API_BASE=http://<mac>.tailnet:23373` env var injected from Cloud Run.
- **Availability:** if Mac is off, the reachability probe fails cleanly — Cloud Run Job logs "beeper unavailable, skipped", exits 0, no data written that hour.
- **Cost:** $0 additional (Tailscale free tier is 3 users / 100 devices; Cloud Run hourly fits in free tier).
- **Setup time:** ~1 hour.
- **Control surface:** Cloud Run logs, Cloud Scheduler, existing `/api/pipeline-paused` emergency stop. No Mac processes running when Peter isn't watching — Beeper Desktop already runs anyway; Tailscale just exposes it.
- **Downside:** Mac's availability caps harvest availability. Still "local dependency" in the data-source sense, but orchestration is fully cloud.

## Option B — GCE VM running Beeper Linux headlessly

```
  [GCP]
    Compute Engine e2-small
      ↳ Beeper AppImage (Linux) running under Xvfb
         ↓ localhost:23373
      ↳ Cloud Run Job (same VPC)
          ↓ writes
        GCS: data/interactions/*.jsonl
    Cloud Scheduler triggers job
```

- **Peter does:** one-time: spin up the VM, install Beeper, log in to Peter's Beeper account via Chrome Remote Desktop / VNC (this is the ~30 min part — Beeper sync takes time), enable the Desktop API toggle, enable Start-on-Launch, lock down VM via firewall.
- **Runtime:** same as Option A but Beeper + Cloud Run in the same VPC, no tailnet.
- **Availability:** 24/7 — VM never sleeps. Beeper Desktop auto-starts on VM boot.
- **Cost:** e2-small ~ $6-12/mo ($72-144/yr) depending on region + commitment.
- **Setup time:** ~3-4 hours first time (Beeper Linux's headless auth dance is fiddly, sync takes an hour or two for a full account history).
- **Control surface:** everything on GCP — no Mac involvement.
- **Downside:** initial auth complexity, ongoing VM maintenance (OS patches, Beeper updates), cost. Two copies of Beeper running Peter's account (Mac desktop + VM) — risk of Beeper treating this as a weird multi-device setup.

## Option C — Direct Matrix API (skip Beeper Desktop entirely)

```
  [GCP]
    Cloud Run Job
      ↳ matrix-nio Python client
         ↓ HTTPS
      ↳ matrix.beeper.com (Peter's Matrix homeserver)
          ↓ writes
        GCS: data/interactions/*.jsonl
    Cloud Scheduler triggers job
```

- **Peter does:** one-time: generate a Matrix access token from Beeper Desktop → Settings → Developers, drop it in Secret Manager.
- **Runtime:** new `harvester/matrix_client.py` replacing `harvester/beeper_client.py`. Pure HTTP client against `matrix.beeper.com`. Room IDs and event format are native Matrix — we lose the "beeper already normalizes WhatsApp into a nice shape" layer and have to do bridge-specific parsing (each bridge puts metadata in its own Matrix event field).
- **Availability:** 24/7, cloud-native, zero extra infra.
- **Cost:** $0 (Cloud Run free tier handles the volume).
- **Setup time:** 2-3 days of engineering work to write + test the Matrix client. Can ship incrementally (WhatsApp first, add bridges one at a time).
- **Control surface:** everything on GCP.
- **Downside:** real rewrite. The existing `beeper_client.py` (688 lines) becomes reference documentation, not runnable code. Bridge parsing quirks cost time per bridge added.

## Option D — Supervised session-only (what we just demonstrated)

```
  [Peter + Claude Code session]
    mcp__beeper__list_messages  (live, in-session)
       ↓
    scripts/mcp_harvest_session.py
       ↓
    data/interactions/*.jsonl  (local)
       ↓
    uv run python main.py score-interactions
       ↓
    data/interactions/contact_kpis.json
    (upload to GCS on demand)
```

- **Peter does:** nothing scheduled — runs `/sprint-day` or similar during a work session and the harvester runs in-flight under his supervision.
- **Runtime:** proven. 15 records, 2 contacts scored, KPIs shaped correctly, all in ~30 seconds during the Session 2 wrap.
- **Availability:** as often as Peter opens Claude Code and runs the script.
- **Cost:** $0.
- **Setup time:** done.
- **Control surface:** Peter sees every tool call in real-time in the Claude Code UI.
- **Downside:** no scheduled runs. KPI freshness depends on how often Peter runs it. Fine for weekly FollowUp cadence; bad for "what's waiting for my reply right now" style alerts.

## Decision

**Picked: Option D — supervised session-only**, wired into the session-start convention.

Peter's answers on 2026-04-21:
1. Mac is occupied by his own work during the day; he'd rather tie harvest cadence to when he *starts a session in this project* than to a calendar. → Option A's Cloud Scheduler cadence is wrong shape; the right cadence is "first step of /getready".
2. No need for real-time alerts; dashboard-poll-from-time-to-time is enough. → Option C (Matrix rewrite) is over-specced for current need.
3. Minimum new infra, minimum new cost. → Option B ruled out.

Mechanism:
- `scripts/mcp_harvest_session.py` is the runner (this PR).
- Project CLAUDE.md now says "Step 0 of every session: run the MCP harvest before /getready".
- GCS upload uses Peter's ADC (`gcloud auth application-default login`), no service-account key needed.
- Idempotent — dedup by `interactionId` means re-running mid-session is free.

Revisit triggers:
- If harvest cadence consistently lags behind what the dashboard needs → Option A (Tailscale + Cloud Run, 1h setup, $0).
- If Peter wants "what's waiting for my reply *right now*" alerts → Option C (Matrix rewrite, 2-3 days).
- Don't revisit Option B (GCE VM + Beeper Linux) unless the Mac becomes a multi-week outage case — cost/complexity never wins over A.

## Non-goals for this decision

- Running the Cloud Run *pipeline* (phases 0-5) — that's already cloud-native, separate system, already ships monthly. Not blocked on this decision.
- Running a *second* Beeper account on a VM. Peter's Beeper runs on Peter's Mac, period.
