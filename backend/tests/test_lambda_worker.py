from __future__ import annotations

import lambda_worker


def test_worker_handler_processes_each_job(monkeypatch):
    processed: list[str] = []

    monkeypatch.setattr(lambda_worker, "process_analysis_job", lambda job_id: processed.append(job_id))

    result = lambda_worker.handler(
        {
            "Records": [
                {"messageId": "message-001", "body": "{\"job_id\":\"job-001\"}"},
                {"messageId": "message-002", "body": "job-002"},
            ]
        },
        None,
    )

    assert processed == ["job-001", "job-002"]
    assert result == {"batchItemFailures": []}


def test_worker_handler_reports_batch_failure_for_failed_record(monkeypatch):
    processed: list[str] = []

    def fake_process(job_id: str) -> None:
        processed.append(job_id)
        if job_id == "job-002":
            raise RuntimeError("boom")

    monkeypatch.setattr(lambda_worker, "process_analysis_job", fake_process)

    result = lambda_worker.handler(
        {
            "Records": [
                {"messageId": "message-001", "body": "{\"job_id\":\"job-001\"}"},
                {"messageId": "message-002", "body": "{\"job_id\":\"job-002\"}"},
            ]
        },
        None,
    )

    assert processed == ["job-001", "job-002"]
    assert result == {"batchItemFailures": [{"itemIdentifier": "message-002"}]}
