from __future__ import annotations

import pytest

import app.services.analysis_jobs_service as jobs_module

from tests.helpers import make_sprite_data_uri


def test_process_analysis_job_runs_analysis_and_saves_item_images(monkeypatch):
    saved_images: list[tuple[str, str, str]] = []
    sprite_call: dict[str, object] = {}
    completed: dict[str, object] = {}

    monkeypatch.setattr(
        jobs_module,
        "claim_analysis_job",
        lambda job_id: {
            "id": job_id,
            "user_id": "user-test-123",
            "photo_id": "photo-001",
            "model_used": "gemini-2.5-flash",
        },
    )
    monkeypatch.setattr(
        jobs_module,
        "get_photo_storage_path_for_user",
        lambda user_id, photo_id: "uploads/user-test-123/closet-photo.jpg",
    )
    monkeypatch.setattr(jobs_module, "download_photo_bytes", lambda storage_path: b"source-photo-bytes")
    monkeypatch.setattr(
        jobs_module,
        "analyze_outfit_with_gemini",
        lambda image_bytes, mime_type, model=None: {
            "outfits": [
                {
                    "style": "Business Casual",
                    "items": [
                        {
                            "category": "Top",
                            "name": "Oxford Shirt",
                            "color": "Blue",
                            "description": "Blue cotton oxford shirt",
                        },
                        {
                            "category": "Bottom",
                            "name": "Chino Pants",
                            "color": "Tan",
                            "description": "Tan slim chino pants",
                        },
                    ],
                }
            ],
            "_usage": {
                "input_tokens": 111,
                "output_tokens": 222,
            },
        },
    )
    monkeypatch.setattr(
        jobs_module,
        "persist_analysis_for_photo",
        lambda user_id, photo_id, analysis, job_id=None: {
            "items": [
                {"id": "item-001"},
                {"id": "item-002"},
            ]
        },
    )

    def fake_generate_item_sprite_with_gemini(
        items,
        *,
        grid_cols: int,
        grid_rows: int,
        reference_image_bytes: bytes,
        reference_mime_type: str,
        return_usage: bool,
    ):
        sprite_call.update(
            {
                "item_count": len(items),
                "grid_cols": grid_cols,
                "grid_rows": grid_rows,
                "reference_image_bytes": reference_image_bytes,
                "reference_mime_type": reference_mime_type,
                "return_usage": return_usage,
            }
        )
        return make_sprite_data_uri(), {"input_tokens": 33, "output_tokens": 44}

    def fake_save_generated_item_image(user_id: str, item_id: str, data_uri: str) -> None:
        saved_images.append((user_id, item_id, data_uri))

    def fake_mark_analysis_job_completed(job_id: str, *, tokens_input: int, tokens_output: int) -> None:
        completed.update(
            {
                "job_id": job_id,
                "tokens_input": tokens_input,
                "tokens_output": tokens_output,
            }
        )

    monkeypatch.setattr(jobs_module, "generate_item_sprite_with_gemini", fake_generate_item_sprite_with_gemini)
    monkeypatch.setattr(jobs_module, "save_generated_item_image", fake_save_generated_item_image)
    monkeypatch.setattr(jobs_module, "mark_analysis_job_completed", fake_mark_analysis_job_completed)
    monkeypatch.setattr(
        jobs_module,
        "mark_analysis_job_failed",
        lambda job_id, message: pytest.fail(f"Job should not fail: {job_id} {message}"),
    )

    jobs_module.process_analysis_job("job-001")

    assert sprite_call == {
        "grid_cols": 2,
        "grid_rows": 2,
        "item_count": 2,
        "reference_image_bytes": b"source-photo-bytes",
        "reference_mime_type": "image/jpeg",
        "return_usage": True,
    }
    assert [item_id for _user_id, item_id, _data_uri in saved_images] == ["item-001", "item-002"]
    assert all(user_id == "user-test-123" for user_id, _item_id, _data_uri in saved_images)
    assert all(data_uri.startswith("data:image/jpeg;base64,") for _user_id, _item_id, data_uri in saved_images)
    assert completed == {
        "job_id": "job-001",
        "tokens_input": 144,
        "tokens_output": 266,
    }
