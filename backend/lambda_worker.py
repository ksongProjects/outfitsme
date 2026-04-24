from __future__ import annotations

import logging

from app.services.analysis_jobs_service import process_analysis_job
from app.services.job_queue_service import extract_analysis_job_id_from_sqs_record


logger = logging.getLogger(__name__)


def handler(event, _context):
    batch_failures: list[dict[str, str]] = []
    records = event.get("Records", []) if isinstance(event, dict) else []

    for record in records:
        message_id = str((record or {}).get("messageId") or "").strip()
        try:
            process_analysis_job(extract_analysis_job_id_from_sqs_record(record))
        except Exception:  # noqa: BLE001
            logger.exception("Failed to process analysis SQS message.", extra={"message_id": message_id or None})
            if message_id:
                batch_failures.append({"itemIdentifier": message_id})
            else:
                raise

    return {"batchItemFailures": batch_failures}
