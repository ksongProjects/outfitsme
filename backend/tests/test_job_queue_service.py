from __future__ import annotations

import json

import pytest

import app.services.job_queue_service as queue_module


def test_send_analysis_job_message_raises_when_queue_not_configured(monkeypatch):
    monkeypatch.setattr(queue_module.settings, "ANALYSIS_QUEUE_URL", "", raising=False)

    with pytest.raises(queue_module.AnalysisQueueNotConfiguredError):
        queue_module.send_analysis_job_message("job-001")


def test_send_analysis_job_message_posts_json_payload(monkeypatch):
    sent: dict[str, object] = {}

    class FakeSqsClient:
        def send_message(self, **kwargs):
            sent.update(kwargs)
            return {"MessageId": "message-001"}

    monkeypatch.setattr(queue_module.settings, "ANALYSIS_QUEUE_URL", "https://sqs.example/analysis", raising=False)
    monkeypatch.setattr(queue_module.settings, "AWS_REGION", "us-west-2", raising=False)
    monkeypatch.setattr(queue_module, "_create_sqs_client", lambda: FakeSqsClient())

    response = queue_module.send_analysis_job_message(" job-001 ")

    assert response == {"MessageId": "message-001"}
    assert sent["QueueUrl"] == "https://sqs.example/analysis"
    assert json.loads(str(sent["MessageBody"])) == {"job_id": "job-001"}


def test_extract_analysis_job_id_from_sqs_record_accepts_json_body():
    job_id = queue_module.extract_analysis_job_id_from_sqs_record(
        {"messageId": "message-001", "body": "{\"job_id\":\"job-001\"}"}
    )

    assert job_id == "job-001"


def test_extract_analysis_job_id_from_sqs_record_accepts_plain_text_body():
    job_id = queue_module.extract_analysis_job_id_from_sqs_record(
        {"messageId": "message-001", "body": "job-002"}
    )

    assert job_id == "job-002"
