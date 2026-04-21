# Patch — integrate Beeper bonus into `followup_scorer.py`

**Target sprint:** 3.33 Session 3 (scoring)  
**Prereq:** `harvester/scoring_signals.py` + `config.py` weight constants already landed (this commit).  
**Parent issues:** [#149](https://github.com/peter-fusek/contactrefiner/issues/149), [#150](https://github.com/peter-fusek/contactrefiner/issues/150)

Concrete, line-accurate patch. Apply in one commit after the harvester kernel + contact_matcher land and `data/interactions/contact_kpis.json` exists on GCS.

## Overview

Add an additive `score_beeper` component to the FollowUp scoring formula. It plugs in alongside existing signals (`interaction`, `linkedin`, `completeness`, `exec_bonus`) and is multiplied by `personal_multiplier` like the rest — so personal contacts still get de-weighted.

Capped to `[FOLLOWUP_BEEPER_MIN, FOLLOWUP_BEEPER_MAX]` = `[-20, +40]` so Beeper activity can't drown long-term LinkedIn + completeness context.

## File diff

### `followup_scorer.py`

**Imports — extend the `from config import` block (line 20-37):**

```diff
 from config import (
     DATA_DIR,
+    FOLLOWUP_BEEPER_KPI_FILE,
     FOLLOWUP_COMPLETENESS_WEIGHT,
     FOLLOWUP_EXEC_TITLE_BONUS,
     FOLLOWUP_EXEC_TITLE_KEYWORDS,
     FOLLOWUP_LINKEDIN_WEIGHTS,
     FOLLOWUP_MAX_AGE_MONTHS,
     FOLLOWUP_MAX_MONTHS_CONTRIBUTION,
     FOLLOWUP_MIN_INTERACTIONS,
     FOLLOWUP_MIN_JOB_CHANGE_HEADLINE_LEN,
     FOLLOWUP_MIN_MONTHS,
     FOLLOWUP_OWN_COMPANY_DOMAINS,
     FOLLOWUP_OWN_COMPANY_ORG_KEYWORDS,
     FOLLOWUP_PERSONAL_EMAIL_DOMAINS,
     FOLLOWUP_PERSONAL_PENALTY,
     FOLLOWUP_SCORES_FILE,
     FOLLOWUP_TOP_N,
+    FOLLOWUP_BEEPER_AWAITING_MY_REPLY,
+    FOLLOWUP_BEEPER_MULTICHANNEL,
+    FOLLOWUP_BEEPER_BUSINESS_KEYWORDS,
+    FOLLOWUP_BEEPER_BUSINESS_HOURS,
+    FOLLOWUP_BEEPER_INBOUND_HEAVY,
+    FOLLOWUP_BEEPER_STALE_SENT_PENALTY,
+    FOLLOWUP_BEEPER_LONG_SILENCE_PENALTY,
+    FOLLOWUP_BEEPER_MAX,
+    FOLLOWUP_BEEPER_MIN,
+    FOLLOWUP_BEEPER_BUSINESS_HOURS_RATIO,
+    FOLLOWUP_BEEPER_INBOUND_HEAVY_DELTA,
+    FOLLOWUP_BEEPER_STALE_SENT_MIN_COUNT,
+    FOLLOWUP_BEEPER_LONG_SILENCE_DAYS,
 )
+from harvester.scoring_signals import (
+    BeeperWeights,
+    ContactKPI,
+    compute_beeper_bonus,
+    load_kpis_from_json,
+)
```

**New loader helper (place after `load_linkedin_signals`, around line 55):**

```python
def load_contact_kpis(path: Optional[Path] = None) -> dict[str, ContactKPI]:
    """Load ContactKPI rollups from local JSON file, keyed by resourceName.

    Returns empty dict if file missing or schema_version mismatches —
    scoring falls back gracefully to pre-Beeper behaviour.
    """
    if path is None:
        path = FOLLOWUP_BEEPER_KPI_FILE
    try:
        kpis = load_kpis_from_json(path)
        if kpis:
            logger.info(f"FollowUp: loaded {len(kpis)} ContactKPI records from {path}")
        return kpis
    except Exception as e:
        logger.warning(f"FollowUp: failed to load contact_kpis.json: {e}")
        return {}


_BEEPER_WEIGHTS = BeeperWeights(
    awaiting_my_reply=FOLLOWUP_BEEPER_AWAITING_MY_REPLY,
    multichannel=FOLLOWUP_BEEPER_MULTICHANNEL,
    business_keywords=FOLLOWUP_BEEPER_BUSINESS_KEYWORDS,
    business_hours=FOLLOWUP_BEEPER_BUSINESS_HOURS,
    inbound_heavy=FOLLOWUP_BEEPER_INBOUND_HEAVY,
    stale_sent_penalty=FOLLOWUP_BEEPER_STALE_SENT_PENALTY,
    long_silence_penalty=FOLLOWUP_BEEPER_LONG_SILENCE_PENALTY,
    cap_max=FOLLOWUP_BEEPER_MAX,
    cap_min=FOLLOWUP_BEEPER_MIN,
    business_hours_ratio_threshold=FOLLOWUP_BEEPER_BUSINESS_HOURS_RATIO,
    inbound_heavy_delta=FOLLOWUP_BEEPER_INBOUND_HEAVY_DELTA,
    stale_sent_min_count=FOLLOWUP_BEEPER_STALE_SENT_MIN_COUNT,
    long_silence_days=FOLLOWUP_BEEPER_LONG_SILENCE_DAYS,
)
```

**Extend `FollowUpScore` dataclass (around line 58, add after `personal_multiplier`):**

```diff
     score_exec: float
     personal_multiplier: float
+    score_beeper: float               # ContactKPI-driven bonus (#150), capped [-20, +40]
+    beeper_channel_primary: Optional[str] = None
+    beeper_awaiting_reply_side: Optional[str] = None
+    beeper_messages_30d_in: int = 0
+    beeper_messages_30d_out: int = 0
+    beeper_channels_30d: int = 0
     score_total: float
```

**Extend `score_contacts` signature + body (line 190 onwards):**

```diff
 def score_contacts(
     contacts: list[dict],
     interactions: dict[str, dict],
     contact_emails: dict[str, set[str]],
     linkedin_signals: dict[str, dict],
+    contact_kpis: Optional[dict[str, ContactKPI]] = None,
     top_n: int = FOLLOWUP_TOP_N,
     min_interactions: int = FOLLOWUP_MIN_INTERACTIONS,
     min_months: float = FOLLOWUP_MIN_MONTHS,
 ) -> list[FollowUpScore]:
-    """Score all contacts and return top_n sorted by score_total descending.
-
-    LinkedIn job_change signals bypass the min_months and min_interactions filters.
-    """
+    """Score all contacts and return top_n sorted by score_total descending.
+
+    LinkedIn job_change signals bypass the min_months and min_interactions filters.
+    If contact_kpis is provided, each contact's multi-channel Beeper activity
+    contributes an additive bonus via compute_beeper_bonus() (#150).
+    """
+    contact_kpis = contact_kpis or {}
     today = datetime.now(timezone.utc)
```

**Score computation block (replace lines ~271-281):**

```diff
         # Score components
         # Cap gap contribution: 7-year silence is not 3.5× more actionable than 2 years
         capped_gap = min(months_gap, FOLLOWUP_MAX_MONTHS_CONTRIBUTION)
         score_interaction = interaction_count * capped_gap
         score_linkedin = FOLLOWUP_LINKEDIN_WEIGHTS.get(li_type, 0.0) if li_type else 0.0
         score_completeness = completeness * FOLLOWUP_COMPLETENESS_WEIGHT
         score_exec = FOLLOWUP_EXEC_TITLE_BONUS if is_exec else 0.0
         personal_multiplier = FOLLOWUP_PERSONAL_PENALTY if is_likely_personal else 1.0
 
-        base_score = score_interaction + score_linkedin + score_completeness + score_exec
+        # Beeper bonus — 0 if no KPI data (graceful fallback when harvester
+        # hasn't run yet or contact has no cross-channel activity)
+        kpi = contact_kpis.get(rn)
+        if kpi:
+            score_beeper = compute_beeper_bonus(kpi, _BEEPER_WEIGHTS, as_of=today)
+            w30 = kpi.windows.get("30d")
+            beeper_channel_primary = kpi.channel_primary
+            beeper_awaiting_side = kpi.last_awaiting_reply_side
+            beeper_msgs_in = w30.messages_in if w30 else 0
+            beeper_msgs_out = w30.messages_out if w30 else 0
+            beeper_channels = len(w30.channels) if w30 else 0
+        else:
+            score_beeper = 0.0
+            beeper_channel_primary = None
+            beeper_awaiting_side = None
+            beeper_msgs_in = 0
+            beeper_msgs_out = 0
+            beeper_channels = 0
+
+        base_score = (
+            score_interaction + score_linkedin + score_completeness
+            + score_exec + score_beeper
+        )
         score_total = base_score * personal_multiplier
```

**Pass new fields in `FollowUpScore(...)` constructor (around line 289):**

```diff
             score_exec=score_exec,
             personal_multiplier=personal_multiplier,
+            score_beeper=score_beeper,
+            beeper_channel_primary=beeper_channel_primary,
+            beeper_awaiting_reply_side=beeper_awaiting_side,
+            beeper_messages_30d_in=beeper_msgs_in,
+            beeper_messages_30d_out=beeper_msgs_out,
+            beeper_channels_30d=beeper_channels,
             score_total=round(score_total, 1),
```

**Extend `build_followup_scores_json` (around line 344):**

```diff
             "score_breakdown": {
                 "interaction": s.score_interaction,
                 "linkedin": s.score_linkedin,
                 "completeness": s.score_completeness,
                 "exec_bonus": s.score_exec,
+                "beeper": s.score_beeper,
                 "personal_multiplier": s.personal_multiplier,
             },
+            "beeper": {
+                "channel_primary": s.beeper_channel_primary,
+                "awaiting_reply_side": s.beeper_awaiting_reply_side,
+                "messages_30d_in": s.beeper_messages_30d_in,
+                "messages_30d_out": s.beeper_messages_30d_out,
+                "channels_30d": s.beeper_channels_30d,
+            } if s.score_beeper != 0 else None,
```

**Extend stats block (around line 383):**

```diff
     stats = {
         "job_change": sum(1 for t in li_types if t == "job_change"),
         "active": sum(1 for t in li_types if t == "active"),
         "profile_only": sum(1 for t in li_types if t == "profile"),
         "no_activity": sum(1 for t in li_types if t == "no_activity"),
         "no_linkedin": sum(1 for s in scored_list if not s.linkedin_signal),
         "avg_completeness": round(
             sum(s.completeness for s in scored_list) / len(scored_list), 1
         ) if scored_list else 0,
+        "beeper_enriched": sum(1 for s in scored_list if s.score_beeper != 0),
+        "avg_beeper_bonus": round(
+            sum(s.score_beeper for s in scored_list) / len(scored_list), 1
+        ) if scored_list else 0,
     }
```

### Caller updates — `main.py` / `entrypoint.py`

Find the call site for `score_contacts(...)` and pass `contact_kpis=load_contact_kpis()`:

```diff
 linkedin_signals = load_linkedin_signals()
+contact_kpis = load_contact_kpis()
 scored = score_contacts(
     contacts,
     interactions,
     contact_emails,
     linkedin_signals,
+    contact_kpis=contact_kpis,
 )
```

## Dashboard

`server/api/followup.get.ts` will start surfacing the new `beeper.*` and `score_breakdown.beeper` fields automatically. The dashboard can show:

- Beeper bonus badge on CRM cards (+15 / -10 / +40 etc.)
- Channel-primary icon
- "Awaiting: your reply" indicator when `beeper.awaiting_reply_side === "mine"`

Spec those surfaces in Sprint 3.34 Session 2 (`/inbox` page + CRM drawer).

## Backwards compatibility

- `contact_kpis.json` missing → `load_contact_kpis()` returns `{}`; scoring reverts to pre-Beeper behaviour with `score_beeper=0`.
- Schema version mismatch → `load_kpis_from_json` returns `{}`; same fallback.
- All new `FollowUpScore` fields default to 0 / None so older serialized JSON still deserializes.

## Test before shipping

1. Run without KPI file: verify ranking matches pre-patch golden output.
2. Run with a small KPI file (5-10 contacts): verify `score_beeper != 0` only for those contacts.
3. Diff the top-50 FollowUp ranking before vs after. Expect business-hot + awaiting-my-reply contacts to rise; stale-sent to fall. Eyeball sanity check: does the new order match your mental model?
4. Flag any contact that moves ±20 ranks — likely needs closer look.

## Rollback

Revert this patch; `score_beeper` disappears, scoring reverts to pre-Beeper formula. No state modification persists in Google Contacts from this patch alone — biography write-back is a separate patch (Sprint 3.34 Session 1).
