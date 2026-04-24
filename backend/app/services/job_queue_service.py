from __future__ import annotations

import json
from typing import Any

from app.config import settings


class AnalysisQueueNotConfiguredError(RuntimeError):
    pass


def is_analysis_queue_configured() -> bool:
    return bool(str(settings.ANALYSIS_QUEUE_URL or "").strip())


def _create_sqs_client():
    try:
        import boto3
    except ImportError as exc:  # pragma: no cover - depends on runtime image
        raise RuntimeError("boto3 is required when ANALYSIS_QUEUE_URL is configured.") from exc

    region_name = str(settings.AWS_REGION or "").strip() or None
    if region_name:
        return boto3.client("sqs", region_name=region_name)
    return boto3.client("sqs")


def send_analysis_job_message(job_id: str) -> dict[str, Any]:
    queue_url = str(settings.ANALYSIS_QUEUE_URL or "").strip()
    normalized_job_id = str(job_id or "").strip()
    if not queue_url:
        raise AnalysisQueueNotConfiguredError("ANALYSIS_QUEUE_URL is required to enqueue analysis jobs.")
    if not normalized_job_id:
        raise ValueError("job_id is required to enqueue analysis jobs.")

    return _create_sqs_client().send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps({"job_id": normalized_job_id}),
    )


def extract_analysis_job_id_from_sqs_record(record: dict[str, Any]) -> str:
    if not isinstance(record, dict):
        raise ValueError("SQS record must be an object.")

    body = record.get("body")
    if isinstance(body, dict):
        payload = body
    else:
        raw_body = str(body or "").strip()
        if not raw_body:
            raise ValueError("SQS record body is empty.")
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            payload = {"job_id": raw_body}

    if not isinstance(payload, dict):
        raise ValueError("SQS record body must decode to an object.")

    job_id = str(payload.get("job_id") or "").strip()
    if not job_id:
        raise ValueError("SQS record is missing job_id.")
    return job_id
