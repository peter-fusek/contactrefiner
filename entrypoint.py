#!/usr/bin/env python3
"""
Cloud Run Job entry point for Google Contacts Refiner.

Runs the full pipeline: backup → analyze → fix (auto mode).
If a pending session exists (from a previous timeout), resumes from checkpoint.
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


def run():
    """Execute the full contacts refiner pipeline."""
    start = datetime.now()
    dry_run = os.getenv("DRY_RUN", "").lower() in ("1", "true", "yes")

    # Check for pending session (e.g. previous run timed out)
    from recovery import RecoveryManager
    if RecoveryManager.has_pending_session():
        logger.info("Pending session found — resuming from checkpoint")
        try:
            from main import cmd_resume
            cmd_resume()
        except Exception as e:
            logger.error(f"Resume failed: {e}")
            traceback.print_exc()
            sys.exit(1)

        elapsed = datetime.now() - start
        logger.info(f"Resume completed in {elapsed}")
        return

    # Fresh run: backup → analyze → fix
    logger.info("Pipeline started (fresh run)")

    # Step 1: Backup
    logger.info("Step 1/3: Backup")
    try:
        from main import cmd_backup
        cmd_backup()
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # Step 2: Analyze
    logger.info("Step 2/3: Analyze")
    try:
        from main import cmd_analyze
        cmd_analyze()
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    # Step 3: Auto-fix (high confidence only)
    logger.info(f"Step 3/3: Auto-fix {'(DRY RUN)' if dry_run else ''}")
    try:
        from main import cmd_fix
        cmd_fix(auto_mode=True, confidence_threshold=0.90, dry_run=dry_run)
    except Exception as e:
        logger.error(f"Auto-fix failed: {e}")
        traceback.print_exc()
        sys.exit(1)

    elapsed = datetime.now() - start
    logger.info(f"Pipeline completed in {elapsed}")


if __name__ == "__main__":
    run()
