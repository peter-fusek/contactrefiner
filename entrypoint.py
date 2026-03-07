#!/usr/bin/env python3
"""
Cloud Run Job entry point for Google Contacts Refiner.

Two-phase pipeline:
  Phase 1 (fast, ~5 min): backup → analyze (rule-based, NO AI) → auto-fix HIGH
  Phase 2 (slow, checkpointed): AI review of MEDIUM changes → auto-fix promoted

Resume logic (after timeout/crash):
  - AI review checkpoint exists → resume Phase 2
  - Fix checkpoint exists → resume fix
  - Otherwise → fresh Phase 1
"""
import logging
import os
import sys
import traceback
from datetime import datetime

# Configure logging for Cloud Logging (structured JSON to stdout)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("contacts-refiner")


def _process_review_feedback():
    """
    Phase 0: Process review decisions from the dashboard.

    Reads review_decisions_*.json files from GCS, applies approved/edited
    changes via People API, feeds all decisions into memory for learning,
    and archives processed files.
    """
    import glob as glob_module
    import json
    import shutil
    from collections import defaultdict
    from pathlib import Path

    from config import DATA_DIR
    from memory import MemoryManager

    # Find unprocessed decision files
    pattern = str(DATA_DIR / "review_decisions_*.json")
    decision_files = sorted(glob_module.glob(pattern))

    if not decision_files:
        logger.info("Phase 0: No review decisions to process")
        return

    logger.info(f"Phase 0: Processing {len(decision_files)} review decision file(s)")

    memory = MemoryManager()
    feedback_entries = []
    # Collect approved/edited changes grouped by resourceName
    changes_by_contact: dict[str, list[dict]] = defaultdict(list)

    for filepath in decision_files:
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)

            # New enriched format: list of change objects in "changes" key
            changes_list = data.get("changes", [])
            logger.info(f"Phase 0: {filepath} — {len(changes_list)} actionable changes")

            for change in changes_list:
                decision = change.get("decision", "")
                resource_name = change.get("resourceName")

                # Collect feedback for memory learning
                if decision in ("approved", "edited"):
                    feedback_entries.append({
                        "type": "approval" if decision == "approved" else "edit",
                        "ruleCategory": change.get("reason", "other"),
                        "field": change.get("field", ""),
                        "old": change.get("old", ""),
                        "suggested": change.get("new", ""),
                        "finalValue": change.get("editedValue") or change.get("new", ""),
                        "confidence": change.get("confidence", 0),
                    })

                    # Collect for API application
                    if resource_name and change.get("field"):
                        new_value = change.get("editedValue") or change.get("new", "")
                        changes_by_contact[resource_name].append({
                            "field": change["field"],
                            "old": change.get("old", ""),
                            "new": new_value,
                            "confidence": change.get("confidence", 0.65),
                            "reason": f"review:{change.get('reason', '')}",
                        })

            # Archive processed file (move to archive/ subdirectory)
            archive_dir = DATA_DIR / "archive"
            archive_dir.mkdir(exist_ok=True)
            archive_path = archive_dir / Path(filepath).name
            shutil.move(filepath, archive_path)
            logger.info(f"Phase 0: Archived {filepath} -> {archive_path}")

        except Exception as e:
            logger.error(f"Phase 0: Failed to process {filepath}: {e}")

    # Feed all decisions into memory for learning
    if feedback_entries:
        memory.process_review_feedback(feedback_entries)
        memory.save()
        logger.info(f"Phase 0: Processed {len(feedback_entries)} feedback entries into memory")

    # Apply approved/edited changes via People API
    if changes_by_contact:
        _apply_review_changes(changes_by_contact)


def _apply_review_changes(changes_by_contact: dict[str, list[dict]]):
    """Apply approved review changes to contacts via People API."""
    import uuid

    from auth import authenticate
    from api_client import PeopleAPIClient
    from batch_processor import build_update_body
    from changelog import ChangeLog
    from utils import get_etag

    creds = authenticate()
    client = PeopleAPIClient(creds)
    session_id = f"review_{uuid.uuid4().hex[:8]}"
    changelog = ChangeLog(session_id)

    total_contacts = len(changes_by_contact)
    applied = 0
    failed = 0

    logger.info(f"Phase 0: Applying review changes to {total_contacts} contacts")
    changelog.log_batch_start(0, total_contacts)

    for resource_name, changes in changes_by_contact.items():
        try:
            # Fetch fresh contact data for current etag
            person = client.get_contact(resource_name)
            etag = get_etag(person)

            # Build update payload
            result = build_update_body(person, changes)
            if not result:
                logger.warning(f"Phase 0: No valid update body for {resource_name}")
                continue

            update_body, update_fields = result

            # Apply update
            client.update_contact(resource_name, etag, update_body, update_fields)

            # Log each change
            for change in changes:
                changelog.log_change(
                    resource_name=resource_name,
                    field=change["field"],
                    old_value=change["old"],
                    new_value=change["new"],
                    reason=change["reason"],
                    confidence=change["confidence"],
                    batch=0,
                )
            applied += 1

        except Exception as e:
            logger.error(f"Phase 0: Failed to update {resource_name}: {e}")
            failed += 1

    changelog.log_batch_end(0, applied, failed)
    logger.info(f"Phase 0: Applied review changes — {applied} ok, {failed} failed")


def run():
    """Execute the contacts refiner pipeline."""
    start = datetime.now()
    dry_run = os.getenv("DRY_RUN", "").lower() in ("1", "true", "yes")
    skip_ai = os.getenv("SKIP_AI_REVIEW", "").lower() in ("1", "true", "yes")

    from config import AI_REVIEW_CHECKPOINT
    from recovery import RecoveryManager

    # ── Phase 0: Process review feedback ─────────────────────────────
    try:
        _process_review_feedback()
    except Exception as e:
        logger.warning(f"Phase 0 failed (non-fatal): {e}")

    # ── Resume routing ──────────────────────────────────────────────
    # Priority 1: AI review checkpoint (Phase 2 was interrupted)
    if AI_REVIEW_CHECKPOINT.exists():
        logger.info("AI review checkpoint found — resuming Phase 2")
        try:
            from main import cmd_ai_review, cmd_fix
            cmd_ai_review(resume=True)
            # After AI review, apply promoted changes
            logger.info("Phase 2: Auto-fix promoted changes")
            cmd_fix(auto_mode=True, confidence_threshold=0.90, dry_run=dry_run)
        except Exception as e:
            logger.error(f"AI review resume failed: {e}")
            traceback.print_exc()
            sys.exit(1)
        _log_elapsed(start)
        return

    # Priority 2: Fix checkpoint (Phase 1 step 3 or Phase 2 fix was interrupted)
    if RecoveryManager.has_pending_session():
        logger.info("Fix checkpoint found — resuming")
        try:
            from main import cmd_resume
            cmd_resume()
        except Exception as e:
            logger.error(f"Fix resume failed: {e}")
            traceback.print_exc()
            sys.exit(1)
        _log_elapsed(start)
        return

    # ── Phase 1: Fast mechanical pass ───────────────────────────────
    logger.info("Phase 1: Fast mechanical pass (no AI)")

    # Step 1: Backup
    logger.info("Step 1/3: Backup")
    try:
        from main import cmd_backup
        cmd_backup()
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # Step 2: Analyze (rule-based only — NO AI, fast ~2 min)
    logger.info("Step 2/3: Analyze (rule-based)")
    original_ai = os.environ.get("AI_ENABLED")
    os.environ["AI_ENABLED"] = "false"
    try:
        from main import cmd_analyze
        cmd_analyze()
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        traceback.print_exc()
        sys.exit(1)
    finally:
        # Restore AI_ENABLED for Phase 2
        if original_ai is not None:
            os.environ["AI_ENABLED"] = original_ai
        else:
            os.environ.pop("AI_ENABLED", None)

    # Step 3: Auto-fix HIGH confidence changes (mechanical)
    logger.info(f"Step 3/3: Auto-fix HIGH {'(DRY RUN)' if dry_run else ''}")
    try:
        from main import cmd_fix
        cmd_fix(auto_mode=True, confidence_threshold=0.90, dry_run=dry_run)
    except Exception as e:
        logger.error(f"Auto-fix failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    phase1_elapsed = datetime.now() - start
    logger.info(f"Phase 1 completed in {phase1_elapsed}")

    # ── Phase 2: AI review (checkpointed) ───────────────────────────
    if skip_ai:
        logger.info("Phase 2 skipped (SKIP_AI_REVIEW=true)")
        _log_elapsed(start)
        return

    logger.info("Phase 2: AI review of MEDIUM changes")
    try:
        from main import cmd_ai_review
        promoted_count = cmd_ai_review()
    except Exception as e:
        logger.error(f"AI review failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # Apply promoted changes only if AI actually promoted something
    if promoted_count and promoted_count > 0:
        logger.info(f"Phase 2: Auto-fix {promoted_count} promoted changes")
        try:
            cmd_fix(auto_mode=True, confidence_threshold=0.90, dry_run=dry_run)
        except Exception as e:
            logger.error(f"Promoted fix failed: {e}")
            traceback.print_exc()
            sys.exit(1)
    else:
        logger.info("Phase 2: No promoted changes, skipping fix")

    _log_elapsed(start)


def _log_elapsed(start):
    elapsed = datetime.now() - start
    logger.info(f"Pipeline completed in {elapsed}")


if __name__ == "__main__":
    run()
