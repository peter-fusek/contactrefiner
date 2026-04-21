"""
Multi-channel ContactKPI derivation + Beeper scoring bonus.

Consumes normalized interaction records (shape defined in
docs/schemas/interaction.md) and produces per-contact rollups (shape defined
in docs/schemas/scoring-signals.md).

Zero external deps — stdlib only. Safe to import from followup_scorer.py
without pulling in Beeper/iMessage reader dependencies.

Run directly to execute inline self-tests:
    python -m harvester.scoring_signals

Ships as part of Sprint 3.33 Session 3 (see #150); consumed by:
- followup_scorer.py           — additive beeper_bonus in score_total
- server/utils/lead-signals.ts — new /signals types
- crm_sync.py                  — biography omnichannel block (metadata only)
"""

from __future__ import annotations

import json
import logging
import re
import statistics
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Literal, Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger("contacts-refiner.scoring_signals")

SCHEMA_VERSION = 1

Direction = Literal["inbound", "outbound"]
Side = Literal["mine", "theirs"]


@dataclass
class WindowStats:
    """Stats for one time window (30d / 90d / 365d) for one contact."""
    messages_in: int = 0
    messages_out: int = 0
    channels: list[str] = field(default_factory=list)
    last_inbound_ts: Optional[str] = None
    last_outbound_ts: Optional[str] = None
    median_response_lag_hours_mine: Optional[float] = None
    median_response_lag_hours_theirs: Optional[float] = None
    business_hours_ratio: float = 0.0
    business_keyword_hits: int = 0


@dataclass
class ContactKPI:
    """Per-contact rollup derived from interaction records.

    Schema defined in docs/schemas/scoring-signals.md. Persisted to
    data/interactions/contact_kpis.json by derive_all_kpis().
    """
    resourceName: str
    windows: dict[str, WindowStats] = field(default_factory=dict)
    last_awaiting_reply_side: Optional[Side] = None
    stale_sent_count: int = 0
    channel_primary: Optional[str] = None
    first_seen_ts: Optional[str] = None
    # "Ever" fields span all history, not bounded by windows. Needed so
    # long-silence checks fire even when the last inbound predates the 365d
    # window (e.g. 3-year-silent contact).
    last_inbound_ever_ts: Optional[str] = None
    last_outbound_ever_ts: Optional[str] = None
    computedAt: str = ""
    schema_version: int = SCHEMA_VERSION


# Weights bundle — lets followup_scorer pass config values in without a hard
# dep on `from config import ...` (keeps this module test-friendly).
@dataclass(frozen=True)
class BeeperWeights:
    awaiting_my_reply: float = 15.0
    multichannel: float = 10.0
    business_keywords: float = 20.0
    business_hours: float = 5.0
    inbound_heavy: float = 8.0
    stale_sent_penalty: float = -10.0
    long_silence_penalty: float = -15.0
    cap_max: float = 40.0
    cap_min: float = -20.0
    business_hours_ratio_threshold: float = 0.7
    inbound_heavy_delta: int = 5
    stale_sent_min_count: int = 3
    long_silence_days: int = 180


DEFAULT_WEIGHTS = BeeperWeights()

DEFAULT_BUSINESS_KEYWORDS = (
    "meeting", "demo", "price", "pricing", "proposal", "quote",
    "invoice", "contract", "payment", "deal", "kickoff", "timeline",
    "scope", "sow", "rfp", "po", "offer", "agreement",
)


def _parse_ts(value: Optional[str]) -> Optional[datetime]:
    """Parse ISO-8601 with or without trailing Z into UTC-aware datetime."""
    if not value:
        return None
    # Normalize trailing Z → +00:00 for fromisoformat
    s = value.replace("Z", "+00:00") if value.endswith("Z") else value
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _is_business_hours(
    dt_utc: datetime, tz_name: str, hour_start: int, hour_end: int
) -> bool:
    local = dt_utc.astimezone(ZoneInfo(tz_name))
    if local.weekday() >= 5:  # Sat=5, Sun=6
        return False
    return hour_start <= local.hour < hour_end


def _keyword_hits(text: str, keywords: Iterable[str]) -> int:
    """Count distinct keyword classes that appear in text (word-boundary).

    Each keyword counts at most once per message — prevents over-weighting
    spammy messages that mention "price" 10 times.
    """
    if not text:
        return 0
    lowered = text.lower()
    hits = 0
    for kw in keywords:
        pattern = r"\b" + re.escape(kw.lower()) + r"\b"
        if re.search(pattern, lowered):
            hits += 1
    return hits


def _median_lag_hours(pairs: list[tuple[datetime, datetime]]) -> Optional[float]:
    """Median lag in hours from pairs of (trigger_ts, response_ts).

    Pairs > 14 days apart are dropped (treated as "never replied").
    Requires at least 3 surviving pairs or returns None.
    """
    lags: list[float] = []
    for trigger, response in pairs:
        delta = (response - trigger).total_seconds() / 3600.0
        if 0 < delta <= 14 * 24:
            lags.append(delta)
    if len(lags) < 3:
        return None
    return round(statistics.median(lags), 1)


def _pair_by_thread(
    records: list[dict], trigger_dir: Direction, response_dir: Direction,
) -> list[tuple[datetime, datetime]]:
    """Within each thread, pair trigger messages with the next response.

    For each trigger direction message, find the chronologically-next
    response direction message in the same thread. No message is paired
    twice.
    """
    by_thread: dict[str, list[dict]] = {}
    for r in records:
        tid = r.get("threadId") or ""
        by_thread.setdefault(tid, []).append(r)

    pairs: list[tuple[datetime, datetime]] = []
    for tid, msgs in by_thread.items():
        # Sort by timestamp ascending
        msgs = sorted(msgs, key=lambda m: m.get("timestamp") or "")
        i = 0
        while i < len(msgs):
            m = msgs[i]
            if m.get("direction") != trigger_dir:
                i += 1
                continue
            trigger_ts = _parse_ts(m.get("timestamp"))
            if not trigger_ts:
                i += 1
                continue
            # Find next response_dir after this
            j = i + 1
            while j < len(msgs):
                n = msgs[j]
                if n.get("direction") == response_dir:
                    response_ts = _parse_ts(n.get("timestamp"))
                    if response_ts and response_ts > trigger_ts:
                        pairs.append((trigger_ts, response_ts))
                    break
                j += 1
            i += 1
    return pairs


def _compute_window_stats(
    records: list[dict],
    window_start: datetime,
    window_end: datetime,
    tz_name: str,
    bh_start: int,
    bh_end: int,
    keywords: Iterable[str],
) -> WindowStats:
    in_window = [
        r for r in records
        if (ts := _parse_ts(r.get("timestamp"))) and window_start <= ts < window_end
    ]
    if not in_window:
        return WindowStats()

    channels = sorted({r.get("channel") for r in in_window if r.get("channel")})
    in_msgs = [r for r in in_window if r.get("direction") == "inbound"]
    out_msgs = [r for r in in_window if r.get("direction") == "outbound"]

    last_in_ts = max(
        (_parse_ts(r.get("timestamp")) for r in in_msgs), default=None
    )
    last_out_ts = max(
        (_parse_ts(r.get("timestamp")) for r in out_msgs), default=None
    )

    # Response lag medians — pair within threads
    # "theirs" = time for them to respond after I sent → my outbound → their inbound
    # "mine"   = time for me to respond after they sent → their inbound → my outbound
    pairs_theirs = _pair_by_thread(in_window, "outbound", "inbound")
    pairs_mine = _pair_by_thread(in_window, "inbound", "outbound")

    # Business-hours ratio
    bh_hits = sum(
        1 for r in in_window
        if (ts := _parse_ts(r.get("timestamp")))
        and _is_business_hours(ts, tz_name, bh_start, bh_end)
    )
    bh_ratio = round(bh_hits / len(in_window), 2)

    # Keyword hits — scan summary + subject
    keyword_total = 0
    for r in in_window:
        text_parts = [r.get("summary") or "", r.get("subject") or ""]
        text = " ".join(text_parts)
        keyword_total += _keyword_hits(text, keywords)

    return WindowStats(
        messages_in=len(in_msgs),
        messages_out=len(out_msgs),
        channels=channels,
        last_inbound_ts=last_in_ts.isoformat() if last_in_ts else None,
        last_outbound_ts=last_out_ts.isoformat() if last_out_ts else None,
        median_response_lag_hours_mine=_median_lag_hours(pairs_mine),
        median_response_lag_hours_theirs=_median_lag_hours(pairs_theirs),
        business_hours_ratio=bh_ratio,
        business_keyword_hits=keyword_total,
    )


def derive_kpi(
    records: list[dict],
    resource_name: str,
    *,
    as_of: Optional[datetime] = None,
    tz_name: str = "Europe/Bratislava",
    bh_start: int = 9,
    bh_end: int = 18,
    stale_sent_days: int = 7,
    keywords: Iterable[str] = DEFAULT_BUSINESS_KEYWORDS,
) -> ContactKPI:
    """Derive a ContactKPI from one contact's interaction records.

    `records` must all belong to the same contact (same resourceName after
    matching). Records missing `direction`, `timestamp`, or `channel` are
    ignored.
    """
    if as_of is None:
        as_of = datetime.now(timezone.utc)
    if as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=timezone.utc)

    # Filter to records with the minimum viable shape
    usable = [
        r for r in records
        if r.get("direction") in ("inbound", "outbound")
        and r.get("timestamp")
        and r.get("channel")
    ]

    kpi = ContactKPI(resourceName=resource_name)
    if not usable:
        kpi.computedAt = as_of.isoformat()
        return kpi

    for window_days, key in ((30, "30d"), (90, "90d"), (365, "365d")):
        start = as_of - timedelta(days=window_days)
        kpi.windows[key] = _compute_window_stats(
            usable, start, as_of, tz_name, bh_start, bh_end, keywords,
        )

    # Derived fields
    kpi.first_seen_ts = min(
        r["timestamp"] for r in usable
    )

    # "Ever" fields — spans full history, not window-bounded. Long-silence
    # detection needs this to fire for contacts whose last inbound predates
    # the 365d window.
    inbound_all = [r["timestamp"] for r in usable if r.get("direction") == "inbound"]
    outbound_all = [r["timestamp"] for r in usable if r.get("direction") == "outbound"]
    kpi.last_inbound_ever_ts = max(inbound_all) if inbound_all else None
    kpi.last_outbound_ever_ts = max(outbound_all) if outbound_all else None

    # channel_primary = argmax of (in + out) in 90d, tie-break on recency
    window_90 = kpi.windows.get("90d")
    if window_90 and (window_90.messages_in + window_90.messages_out) > 0:
        by_channel: dict[str, int] = {}
        for r in usable:
            ts = _parse_ts(r.get("timestamp"))
            if ts and ts >= as_of - timedelta(days=90):
                ch = r.get("channel")
                if ch:
                    by_channel[ch] = by_channel.get(ch, 0) + 1
        if by_channel:
            kpi.channel_primary = max(by_channel.items(), key=lambda kv: kv[1])[0]

    # last_awaiting_reply_side: look at most recent message
    most_recent = max(usable, key=lambda r: r["timestamp"])
    if most_recent.get("direction") == "inbound":
        kpi.last_awaiting_reply_side = "mine"
    elif most_recent.get("direction") == "outbound":
        kpi.last_awaiting_reply_side = "theirs"

    # stale_sent_count: my outbound in 30d without follow-up inbound in same thread
    stale_threshold = as_of - timedelta(days=stale_sent_days)
    win30_records = [
        r for r in usable
        if (ts := _parse_ts(r.get("timestamp"))) and ts >= as_of - timedelta(days=30)
    ]
    by_thread: dict[str, list[dict]] = {}
    for r in win30_records:
        by_thread.setdefault(r.get("threadId") or "", []).append(r)

    stale = 0
    for tid, msgs in by_thread.items():
        msgs = sorted(msgs, key=lambda m: m["timestamp"])
        for idx, m in enumerate(msgs):
            if m.get("direction") != "outbound":
                continue
            ts = _parse_ts(m["timestamp"])
            if not ts or ts > stale_threshold:
                continue
            # Any inbound after this outbound in the same thread?
            later_inbound = any(
                n.get("direction") == "inbound"
                for n in msgs[idx + 1:]
            )
            if not later_inbound:
                stale += 1
    kpi.stale_sent_count = stale

    kpi.computedAt = as_of.isoformat()
    return kpi


def derive_all_kpis(
    records_by_contact: dict[str, list[dict]],
    *,
    as_of: Optional[datetime] = None,
    **kwargs,
) -> dict[str, ContactKPI]:
    """Batch: derive KPI for every contact. `records_by_contact` maps
    resourceName → list of that contact's interaction records.
    """
    return {
        rn: derive_kpi(records, rn, as_of=as_of, **kwargs)
        for rn, records in records_by_contact.items()
    }


def compute_beeper_bonus(
    kpi: ContactKPI,
    weights: BeeperWeights = DEFAULT_WEIGHTS,
    *,
    as_of: Optional[datetime] = None,
) -> float:
    """Compute the additive beeper_bonus component of a contact's score.

    Capped to [weights.cap_min, weights.cap_max] so Beeper activity can't
    drown out long-term LinkedIn + completeness signals. Caller adds the
    returned value to base_score before multiplying by personal_multiplier.
    """
    if as_of is None:
        as_of = datetime.now(timezone.utc)

    bonus = 0.0
    w30 = kpi.windows.get("30d")

    if kpi.last_awaiting_reply_side == "mine":
        bonus += weights.awaiting_my_reply

    if w30 and len(w30.channels) >= 2:
        bonus += weights.multichannel

    if w30 and w30.business_keyword_hits >= 1:
        bonus += weights.business_keywords

    if w30 and w30.business_hours_ratio >= weights.business_hours_ratio_threshold:
        bonus += weights.business_hours

    if w30 and (w30.messages_in - w30.messages_out) > weights.inbound_heavy_delta:
        bonus += weights.inbound_heavy

    if kpi.stale_sent_count > weights.stale_sent_min_count:
        bonus += weights.stale_sent_penalty

    # Long-silence check uses the "ever" field, not the 30d window — a
    # contact whose last inbound is 9 months ago has 0 messages in 30d but
    # still deserves the penalty.
    if kpi.last_inbound_ever_ts:
        last_in = _parse_ts(kpi.last_inbound_ever_ts)
        if last_in and (as_of - last_in).days > weights.long_silence_days:
            bonus += weights.long_silence_penalty

    return max(weights.cap_min, min(bonus, weights.cap_max))


def save_kpis_to_json(
    kpis: dict[str, ContactKPI], path: Path,
) -> None:
    """Serialize to data/interactions/contact_kpis.json."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated": datetime.now(timezone.utc).isoformat(),
        "count": len(kpis),
        "kpis": {rn: asdict(kpi) for rn, kpi in kpis.items()},
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    logger.info(f"Wrote {len(kpis)} ContactKPI records to {path}")


def load_kpis_from_json(path: Path) -> dict[str, ContactKPI]:
    """Inverse of save_kpis_to_json. Refuses mismatched schema_version."""
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != SCHEMA_VERSION:
        logger.warning(
            f"ContactKPI schema version mismatch "
            f"(file={data.get('schema_version')}, code={SCHEMA_VERSION}); "
            f"ignoring stale file and triggering recompute",
        )
        return {}
    result: dict[str, ContactKPI] = {}
    for rn, payload in data.get("kpis", {}).items():
        windows = {
            k: WindowStats(**v) for k, v in (payload.get("windows") or {}).items()
        }
        payload["windows"] = windows
        result[rn] = ContactKPI(**payload)
    return result


# ── Inline self-test ──────────────────────────────────────────────────────
# No pytest dep; run via `python -m harvester.scoring_signals`.
# Synthetic fixtures cover the signal permutations called out in the scoring
# schema doc (docs/schemas/scoring-signals.md).

def _fix_ts(days_ago: float, hour: int = 10, minute: int = 0) -> str:
    """Build an ISO UTC timestamp `days_ago` days before 2026-04-21 12:00 UTC."""
    anchor = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)
    ts = anchor - timedelta(days=days_ago, hours=(12 - hour), minutes=-minute)
    return ts.isoformat()


def _run_self_test() -> None:
    print("Running scoring_signals self-test…")
    as_of = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)

    # Case A: business-hot, awaiting my reply, multi-channel.
    # Expected bonus ≥ 45 before cap, capped to 40.
    case_a = [
        {"channel": "whatsapp", "direction": "inbound",
         "timestamp": _fix_ts(1, hour=11), "threadId": "wa:A",
         "summary": "Are you free for a meeting next week? we need a proposal"},
        {"channel": "linkedin_dm", "direction": "inbound",
         "timestamp": _fix_ts(2, hour=14), "threadId": "li:A",
         "summary": "Following up on the demo — any pricing update?"},
        {"channel": "imessage", "direction": "outbound",
         "timestamp": _fix_ts(3, hour=10), "threadId": "im:A",
         "summary": "Will get back on proposal tomorrow"},
        {"channel": "whatsapp", "direction": "inbound",
         "timestamp": _fix_ts(5, hour=15), "threadId": "wa:A",
         "summary": "Let me know about the contract timeline"},
        {"channel": "whatsapp", "direction": "inbound",
         "timestamp": _fix_ts(7, hour=9), "threadId": "wa:A",
         "summary": "Ping"},
        {"channel": "whatsapp", "direction": "inbound",
         "timestamp": _fix_ts(9, hour=11), "threadId": "wa:A",
         "summary": "Ping 2"},
        {"channel": "whatsapp", "direction": "inbound",
         "timestamp": _fix_ts(10, hour=12), "threadId": "wa:A",
         "summary": "Ping 3"},
    ]
    kpi_a = derive_kpi(case_a, "people/cA", as_of=as_of)
    bonus_a = compute_beeper_bonus(kpi_a, as_of=as_of)
    assert kpi_a.windows["30d"].messages_in == 6, kpi_a.windows["30d"]
    assert kpi_a.windows["30d"].messages_out == 1
    assert set(kpi_a.windows["30d"].channels) == {"whatsapp", "linkedin_dm", "imessage"}
    assert kpi_a.last_awaiting_reply_side == "mine", kpi_a.last_awaiting_reply_side
    assert kpi_a.windows["30d"].business_keyword_hits >= 3
    assert bonus_a == DEFAULT_WEIGHTS.cap_max, f"expected cap, got {bonus_a}"
    print(f"  ✓ Case A (business-hot): bonus={bonus_a} (capped)")

    # Case B: long-silent, I'm spamming without reply.
    # Expected bonus: stale_sent_penalty + long_silence_penalty = -25, capped to -20.
    case_b_inbound_old = [
        {"channel": "imessage", "direction": "inbound",
         "timestamp": _fix_ts(250), "threadId": "im:B", "summary": "yo"},
    ]
    case_b_stale_sent = [
        {"channel": "imessage", "direction": "outbound",
         "timestamp": _fix_ts(d), "threadId": f"im:B{d}", "summary": "pinging you"}
        for d in (8, 10, 12, 14)
    ]
    kpi_b = derive_kpi(case_b_inbound_old + case_b_stale_sent, "people/cB", as_of=as_of)
    bonus_b = compute_beeper_bonus(kpi_b, as_of=as_of)
    assert kpi_b.stale_sent_count == 4, kpi_b.stale_sent_count
    assert kpi_b.last_awaiting_reply_side == "theirs"  # most recent is my outbound
    assert bonus_b == DEFAULT_WEIGHTS.cap_min, f"expected floor, got {bonus_b}"
    print(f"  ✓ Case B (stale/silent): bonus={bonus_b} (floored)")

    # Case C: empty / no usable records.
    kpi_c = derive_kpi([], "people/cC", as_of=as_of)
    bonus_c = compute_beeper_bonus(kpi_c, as_of=as_of)
    assert bonus_c == 0.0
    assert kpi_c.channel_primary is None
    assert kpi_c.windows == {}
    print(f"  ✓ Case C (empty): bonus={bonus_c}")

    # Case D: response-lag median — three pairs within window.
    case_d = [
        {"channel": "imessage", "direction": "outbound",
         "timestamp": _fix_ts(10, hour=10), "threadId": "im:D", "summary": "hi"},
        {"channel": "imessage", "direction": "inbound",
         "timestamp": _fix_ts(10, hour=14), "threadId": "im:D", "summary": "hey"},
        {"channel": "imessage", "direction": "outbound",
         "timestamp": _fix_ts(8, hour=10), "threadId": "im:D", "summary": "ping"},
        {"channel": "imessage", "direction": "inbound",
         "timestamp": _fix_ts(8, hour=12), "threadId": "im:D", "summary": "pong"},
        {"channel": "imessage", "direction": "outbound",
         "timestamp": _fix_ts(5, hour=10), "threadId": "im:D", "summary": "?"},
        {"channel": "imessage", "direction": "inbound",
         "timestamp": _fix_ts(5, hour=11), "threadId": "im:D", "summary": "..."},
    ]
    kpi_d = derive_kpi(case_d, "people/cD", as_of=as_of)
    w30 = kpi_d.windows["30d"]
    assert w30.median_response_lag_hours_theirs is not None
    assert 1.0 <= w30.median_response_lag_hours_theirs <= 4.0, w30.median_response_lag_hours_theirs
    print(f"  ✓ Case D (response lag): theirs_median={w30.median_response_lag_hours_theirs}h")

    # Case E: round-trip save/load preserves KPI.
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        tmp_path = Path(tf.name)
    try:
        save_kpis_to_json({"people/cA": kpi_a, "people/cB": kpi_b}, tmp_path)
        loaded = load_kpis_from_json(tmp_path)
        assert loaded["people/cA"].stale_sent_count == kpi_a.stale_sent_count
        assert loaded["people/cB"].last_awaiting_reply_side == "theirs"
        assert loaded["people/cA"].windows["30d"].messages_in == 6
        print(f"  ✓ Case E (save/load round-trip)")
    finally:
        tmp_path.unlink(missing_ok=True)

    print("All self-tests passed.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    _run_self_test()
