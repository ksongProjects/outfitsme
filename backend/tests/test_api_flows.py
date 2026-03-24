from __future__ import annotations

import io

import app.routes.api as api_module

from tests.helpers import make_data_uri, print_exchange


def test_analyze_flow_submit_and_status(client, monkeypatch, auth_headers):
    created_job: dict[str, str] = {}

    def fake_upload_photo_for_user(image, user_id: str) -> str:
        assert user_id == "user-test-123"
        assert image.filename == "closet-photo.jpg"
        return "uploads/user-test-123/closet-photo.jpg"

    def fake_create_photo_record(user_id: str, storage_path: str) -> dict[str, str]:
        assert user_id == "user-test-123"
        assert storage_path == "uploads/user-test-123/closet-photo.jpg"
        return {"id": "photo-001"}

    def fake_create_analysis_job(user_id: str, photo_id: str, model_used: str) -> dict[str, str]:
        assert user_id == "user-test-123"
        assert photo_id == "photo-001"
        created_job.update(
            {
                "id": "job-001",
                "status": "completed",
                "job_type": "analysis",
                "photo_id": photo_id,
                "model_used": model_used,
                "created_at": "2026-03-23T06:00:00+00:00",
                "completed_at": "2026-03-23T06:00:03+00:00",
                "error_message": "",
            }
        )
        return dict(created_job)

    enqueued: list[str] = []

    def fake_enqueue_analysis_job_processing(job_id: str) -> None:
        enqueued.append(job_id)

    def fake_get_analysis_job_for_user(user_id: str, job_id: str) -> dict[str, str]:
        assert user_id == "user-test-123"
        assert job_id == "job-001"
        return dict(created_job)

    def fake_build_analysis_result_for_photo(user_id: str, photo_id: str) -> dict:
        assert user_id == "user-test-123"
        assert photo_id == "photo-001"
        return {
            "photo_id": photo_id,
            "outfits": [
                {
                    "outfit_id": "outfit-001",
                    "style": "Business Casual",
                    "items": [
                        {
                            "id": "item-001",
                            "name": "Oxford Shirt",
                            "category": "Top",
                            "description": "Blue cotton oxford shirt",
                        },
                        {
                            "id": "item-002",
                            "name": "Chino Pants",
                            "category": "Bottom",
                            "description": "Tan slim chino pants",
                        },
                    ],
                }
            ],
        }

    monkeypatch.setattr(api_module, "upload_photo_for_user", fake_upload_photo_for_user)
    monkeypatch.setattr(api_module, "create_photo_record", fake_create_photo_record)
    monkeypatch.setattr(api_module, "create_analysis_job", fake_create_analysis_job)
    monkeypatch.setattr(api_module, "enqueue_analysis_job_processing", fake_enqueue_analysis_job_processing)
    monkeypatch.setattr(api_module, "get_analysis_job_for_user", fake_get_analysis_job_for_user)
    monkeypatch.setattr(api_module, "build_analysis_result_for_photo", fake_build_analysis_result_for_photo)

    request_body = {
        "analysis_model": "gemini-2.5-flash",
        "image": "closet-photo.jpg",
    }
    submit_response = client.post(
        "/api/analyze",
        data={
            "analysis_model": request_body["analysis_model"],
            "image": (io.BytesIO(b"raw-photo-bytes"), request_body["image"]),
        },
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    print_exchange("Analyze Submit", "POST", "/api/analyze", request_body, submit_response)

    assert submit_response.status_code == 202
    assert submit_response.get_json() == {
        "analysis_model": "gemini-2.5-flash",
        "created_at": "2026-03-23T06:00:00+00:00",
        "job_id": "job-001",
        "photo_id": "photo-001",
        "status": "completed",
    }
    assert enqueued == ["job-001"]

    status_response = client.get("/api/analyze/jobs/job-001", headers=auth_headers)
    print_exchange("Analyze Status", "GET", "/api/analyze/jobs/job-001", None, status_response)

    assert status_response.status_code == 200
    assert status_response.get_json() == {
        "completed_at": "2026-03-23T06:00:03+00:00",
        "created_at": "2026-03-23T06:00:00+00:00",
        "error_message": "",
        "job_id": "job-001",
        "result": {
            "photo_id": "photo-001",
            "outfits": [
                {
                    "items": [
                        {
                            "category": "Top",
                            "description": "Blue cotton oxford shirt",
                            "id": "item-001",
                            "name": "Oxford Shirt",
                        },
                        {
                            "category": "Bottom",
                            "description": "Tan slim chino pants",
                            "id": "item-002",
                            "name": "Chino Pants",
                        },
                    ],
                    "outfit_id": "outfit-001",
                    "style": "Business Casual",
                }
            ],
        },
        "status": "completed",
        "updated_at": "2026-03-23T06:00:03+00:00",
    }


def test_compose_outfit_uses_profile_and_item_images(client, monkeypatch, auth_headers):
    generation_call: dict[str, object] = {}
    saved_paths: list[str] = []

    items = [
        {
            "id": "item-101",
            "name": "Oxford Shirt",
            "category": "Top",
            "description": "Blue cotton oxford shirt",
            "image_path": "items/user-test-123/item-101.png",
        },
        {
            "id": "item-102",
            "name": "Wide Leg Trousers",
            "category": "Bottom",
            "description": "Cream wide leg trousers",
            "image_path": "items/user-test-123/item-102.jpg",
        },
    ]

    def fake_get_items_for_user(user_id: str, item_ids: list[str]) -> list[dict]:
        assert user_id == "user-test-123"
        assert item_ids == ["item-101", "item-102"]
        return items

    def fake_get_user_model_settings(user_id: str) -> dict:
        assert user_id == "user-test-123"
        return {
            "profile_photo_path": "profiles/user-test-123/avatar.jpg",
            "profile_gender": "woman",
            "profile_age": 29,
        }

    def fake_download_photo_bytes(storage_path: str) -> bytes:
        if storage_path.endswith("avatar.jpg"):
            return b"profile-photo-bytes"
        if storage_path.endswith("item-101.png"):
            return b"shirt-image-bytes"
        if storage_path.endswith("item-102.jpg"):
            return b"trouser-image-bytes"
        raise AssertionError(f"Unexpected storage path: {storage_path}")

    def fake_generate_outfitsme_image_with_gemini(**kwargs):
        generation_call.update(kwargs)
        return (
            make_data_uri(color=(90, 160, 210)),
            {
                "model": "gemini-2.5-flash-image",
                "input_tokens": 321,
                "output_tokens": 654,
            },
        )

    def fake_save_generated_outfit_image(user_id: str, name: str, data_uri: str) -> dict[str, str]:
        assert user_id == "user-test-123"
        assert name
        assert data_uri.startswith("data:image/")
        saved_paths.append(f"generated/{name}.png")
        return {
            "storage_path": saved_paths[-1],
            "image_url": f"https://cdn.example/{saved_paths[-1]}",
        }

    def fake_create_photo_record(user_id: str, storage_path: str) -> dict[str, str]:
        assert user_id == "user-test-123"
        assert storage_path == saved_paths[-1]
        return {"id": "photo-generated-001"}

    def fake_create_completed_ai_job(user_id: str, **kwargs) -> dict[str, str]:
        assert user_id == "user-test-123"
        assert kwargs["photo_id"] == "photo-generated-001"
        assert kwargs["job_type"] == "try_on"
        return {"id": "job-try-on-001"}

    def fake_create_outfit_with_items(user_id: str, **kwargs) -> dict[str, str]:
        assert user_id == "user-test-123"
        assert kwargs["item_ids"] == ["item-101", "item-102"]
        return {"id": "outfit-900", "style_label": kwargs["style_label"]}

    monkeypatch.setattr(api_module, "get_items_for_user", fake_get_items_for_user)
    monkeypatch.setattr(api_module, "get_user_model_settings", fake_get_user_model_settings)
    monkeypatch.setattr(api_module, "download_photo_bytes", fake_download_photo_bytes)
    monkeypatch.setattr(api_module, "generate_outfitsme_image_with_gemini", fake_generate_outfitsme_image_with_gemini)
    monkeypatch.setattr(api_module, "save_generated_outfit_image", fake_save_generated_outfit_image)
    monkeypatch.setattr(api_module, "create_photo_record", fake_create_photo_record)
    monkeypatch.setattr(api_module, "create_completed_ai_job", fake_create_completed_ai_job)
    monkeypatch.setattr(api_module, "create_outfit_with_items", fake_create_outfit_with_items)

    request_body = {
        "item_ids": ["item-101", "item-102"],
        "style_label": "Business Casual",
    }
    response = client.post("/api/outfits/compose", json=request_body, headers=auth_headers)
    print_exchange("Compose Outfit", "POST", "/api/outfits/compose", request_body, response)

    assert response.status_code == 200
    assert response.get_json() == {
        "ai_usage": {
            "input_tokens": 321,
            "model": "gemini-2.5-flash-image",
            "output_tokens": 654,
        },
        "image_storage_path": saved_paths[-1],
        "image_url": f"https://cdn.example/{saved_paths[-1]}",
        "outfit_id": "outfit-900",
        "photo_id": "photo-generated-001",
        "style_label": "Business Casual",
    }

    assert generation_call["reference_image_bytes"] == b"profile-photo-bytes"
    assert generation_call["reference_mime_type"] == "image/jpeg"
    assert generation_call["outfit_style"] == "Business Casual"
    assert generation_call["outfit_items"] == items
    assert generation_call["outfit_item_reference_images"] == [
        (b"shirt-image-bytes", "image/png"),
        (b"trouser-image-bytes", "image/jpeg"),
    ]
    assert generation_call["profile_gender"] == "woman"
    assert generation_call["profile_age"] == 29
    assert generation_call["return_usage"] is True


def test_generate_outfitsme_preview_uses_existing_outfit_selection(client, monkeypatch, auth_headers):
    generation_call: dict[str, object] = {}
    attached: list[tuple[str, str, str]] = []

    selected_outfit = {
        "outfit_id": "outfit-777",
        "outfit_index": 0,
        "style": "Weekend Layers",
        "items": [
            {
                "id": "item-201",
                "name": "Denim Jacket",
                "description": "Classic blue denim jacket",
                "image_path": "items/user-test-123/item-201.jpg",
            },
            {
                "id": "item-202",
                "name": "White Tee",
                "description": "Soft white crew neck tee",
                "image_path": "items/user-test-123/item-202.png",
            },
        ],
    }

    def fake_get_outfit_for_generation(user_id: str, photo_id: str, outfit_index: int | None = None) -> dict:
        assert user_id == "user-test-123"
        assert photo_id == "photo-legacy-001"
        assert outfit_index == 0
        return {"outfit": selected_outfit}

    def fake_get_user_model_settings(user_id: str) -> dict:
        assert user_id == "user-test-123"
        return {
            "profile_photo_path": "profiles/user-test-123/avatar.png",
            "profile_gender": "man",
            "profile_age": 34,
        }

    def fake_download_photo_bytes(storage_path: str) -> bytes:
        if storage_path.endswith("avatar.png"):
            return b"profile-preview-bytes"
        if storage_path.endswith("item-201.jpg"):
            return b"jacket-image-bytes"
        if storage_path.endswith("item-202.png"):
            return b"tee-image-bytes"
        raise AssertionError(f"Unexpected storage path: {storage_path}")

    def fake_generate_outfitsme_image_with_gemini(**kwargs):
        generation_call.update(kwargs)
        return (
            make_data_uri(color=(150, 120, 210)),
            {
                "model": "gemini-2.5-flash-image",
                "input_tokens": 120,
                "output_tokens": 240,
            },
        )

    def fake_save_generated_outfit_image(user_id: str, name: str, data_uri: str) -> dict[str, str]:
        assert user_id == "user-test-123"
        assert name == "outfit-777"
        assert data_uri.startswith("data:image/")
        return {
            "storage_path": "generated/outfit-777.png",
            "image_url": "https://cdn.example/generated/outfit-777.png",
        }

    def fake_attach_generated_image_to_outfit(user_id: str, outfit_id: str, storage_path: str) -> None:
        attached.append((user_id, outfit_id, storage_path))

    def fake_create_completed_ai_job(user_id: str, **kwargs) -> dict[str, str]:
        assert user_id == "user-test-123"
        assert kwargs["photo_id"] == "photo-legacy-001"
        assert kwargs["job_type"] == "try_on"
        return {"id": "job-preview-001"}

    monkeypatch.setattr(api_module, "get_outfit_for_generation", fake_get_outfit_for_generation)
    monkeypatch.setattr(api_module, "get_user_model_settings", fake_get_user_model_settings)
    monkeypatch.setattr(api_module, "download_photo_bytes", fake_download_photo_bytes)
    monkeypatch.setattr(api_module, "generate_outfitsme_image_with_gemini", fake_generate_outfitsme_image_with_gemini)
    monkeypatch.setattr(api_module, "save_generated_outfit_image", fake_save_generated_outfit_image)
    monkeypatch.setattr(api_module, "attach_generated_image_to_outfit", fake_attach_generated_image_to_outfit)
    monkeypatch.setattr(api_module, "create_completed_ai_job", fake_create_completed_ai_job)

    request_body = {"outfit_index": 0}
    response = client.post(
        "/api/wardrobe/photo-legacy-001/outfitsme",
        json=request_body,
        headers=auth_headers,
    )
    print_exchange(
        "Wardrobe Preview",
        "POST",
        "/api/wardrobe/photo-legacy-001/outfitsme",
        request_body,
        response,
    )

    assert response.status_code == 200
    assert response.get_json() == {
        "outfit_index": 0,
        "outfitsme_image_url": "https://cdn.example/generated/outfit-777.png",
        "outfitsme_storage_path": "generated/outfit-777.png",
        "photo_id": "photo-legacy-001",
    }
    assert generation_call["reference_image_bytes"] == b"profile-preview-bytes"
    assert generation_call["reference_mime_type"] == "image/png"
    assert generation_call["outfit_style"] == "Weekend Layers"
    assert generation_call["outfit_items"] == selected_outfit["items"]
    assert generation_call["outfit_item_reference_images"] == [
        (b"jacket-image-bytes", "image/jpeg"),
        (b"tee-image-bytes", "image/png"),
    ]
    assert attached == [
        ("user-test-123", "outfit-777", "generated/outfit-777.png"),
    ]


def test_settings_preferences_and_costs_flow(client, monkeypatch, auth_headers):
    updated_payload: dict[str, object] = {}

    def fake_get_user_model_settings(user_id: str) -> dict[str, object]:
        assert user_id == "user-test-123"
        return {
            "user_role": "premium",
            "profile_gender": "male",
            "profile_age": 40,
            "profile_photo_path": "profiles/user-test-123/reference.jpg",
            "enable_outfit_image_generation": True,
            "enable_online_store_search": False,
            "enable_accessory_analysis": False,
        }

    def fake_get_signed_image_url(storage_path: str | None) -> str | None:
        if not storage_path:
            return None
        return f"https://cdn.example/{storage_path}"

    def fake_upsert_user_model_settings(user_id: str, payload: dict[str, object]) -> dict[str, object]:
        assert user_id == "user-test-123"
        updated_payload.update(payload)
        return {
            "user_role": "premium",
            "profile_gender": "male",
            "profile_age": 40,
            "profile_photo_path": "profiles/user-test-123/reference.jpg",
            "profile_photo_url": "https://cdn.example/profiles/user-test-123/reference.jpg",
            "enable_outfit_image_generation": True,
            "enable_online_store_search": False,
            "enable_accessory_analysis": False,
        }

    def fake_get_user_cost_summary(user_id: str, month_start_iso: str) -> dict[str, object]:
        assert user_id == "user-test-123"
        assert month_start_iso.endswith("+00:00")
        return {
            "month_start_utc": month_start_iso,
            "analysis_runs": 4,
            "try_on_generations": 2,
            "composed_outfits_created": 1,
            "custom_outfit_generations": 1,
            "estimated_costs_usd": {
                "analysis": 0,
                "outfit_image_generation": 0,
                "item_image_generation": 0,
                "total": 0,
            },
            "token_usage_estimate": {
                "total": {
                    "input_tokens": 1000,
                    "output_tokens": 500,
                    "total_tokens": 1500,
                    "call_count": 6,
                },
                "source": "Aggregated from ai_jobs token fields.",
            },
        }

    monkeypatch.setattr(api_module, "get_user_model_settings", fake_get_user_model_settings)
    monkeypatch.setattr(api_module, "get_signed_image_url", fake_get_signed_image_url)
    monkeypatch.setattr(api_module, "upsert_user_model_settings", fake_upsert_user_model_settings)
    monkeypatch.setattr(api_module, "get_user_cost_summary", fake_get_user_cost_summary)

    get_preferences_response = client.get("/api/settings/preferences", headers=auth_headers)
    print_exchange("Settings Preferences", "GET", "/api/settings/preferences", None, get_preferences_response)

    assert get_preferences_response.status_code == 200
    assert get_preferences_response.get_json() == {
        "settings": {
            "enable_accessory_analysis": False,
            "enable_online_store_search": False,
            "enable_outfit_image_generation": True,
            "profile_age": 40,
            "profile_gender": "male",
            "profile_photo_url": "https://cdn.example/profiles/user-test-123/reference.jpg",
            "user_role": "premium",
        }
    }

    request_body = {
        "profile_gender": "male",
        "profile_age": "40",
        "enable_outfit_image_generation": True,
        "enable_online_store_search": False,
        "enable_accessory_analysis": False,
    }
    update_preferences_response = client.put(
        "/api/settings/preferences",
        json=request_body,
        headers=auth_headers,
    )
    print_exchange(
        "Settings Update",
        "PUT",
        "/api/settings/preferences",
        request_body,
        update_preferences_response,
    )

    assert update_preferences_response.status_code == 200
    assert updated_payload == request_body
    assert update_preferences_response.get_json() == {
        "settings": {
            "enable_accessory_analysis": False,
            "enable_online_store_search": False,
            "enable_outfit_image_generation": True,
            "profile_age": 40,
            "profile_gender": "male",
            "profile_photo_path": "profiles/user-test-123/reference.jpg",
            "profile_photo_url": "https://cdn.example/profiles/user-test-123/reference.jpg",
            "user_role": "premium",
        }
    }

    costs_response = client.get("/api/settings/costs", headers=auth_headers)
    print_exchange("Settings Costs", "GET", "/api/settings/costs", None, costs_response)

    assert costs_response.status_code == 200
    assert costs_response.get_json()["costs"]["analysis_runs"] == 4
    assert costs_response.get_json()["costs"]["composed_outfits_created"] == 1
    assert costs_response.get_json()["costs"]["custom_outfit_generations"] == 1
