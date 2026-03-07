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

    Reads review_decisions_*.json files from GCS, applies approved changes
    via People API, feeds all decisions into memory for learning, and
    archives processed files.
    """
    import glob as glob_module
    import json
    import shutil

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

    for filepath in decision_files:
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)

            decisions = data.get("decisions", {})
            logger.info(f"Phase 0: {filepath} — {len(decisions)} decisions")

            # Collect feedback for memory learning
            for _change_id, decision in decisions.items():
                dtype = decision.get("decision", "")
                if dtype in ("approved", "rejected", "edited"):
                    feedback_entries.append({
                        "type": "approval" if dtype == "approved" else
                               "rejection" if dtype == "rejected" else "edit",
                        "ruleCategory": decision.get("ruleCategory", "other"),
                        "field": decision.get("field", ""),
                        "old": decision.get("old", ""),
                        "suggested": decision.get("suggested", ""),
                        "finalValue": decision.get("editedValue", decision.get("suggested", "")),
                        "confidence": decision.get("confidence", 0),
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
