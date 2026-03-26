from __future__ import annotations

import app.services.supabase_service as supabase_module


class _FakeUpdateBuilder:
    def __init__(self) -> None:
        self.updated: dict[str, object] | None = None
        self.filters: list[tuple[str, object]] = []
        self.executed = False

    def update(self, payload: dict[str, object]):
        self.updated = payload
        return self

    def eq(self, key: str, value: object):
        self.filters.append((key, value))
        return self

    def execute(self):
        self.executed = True
        return type("Response", (), {"data": []})()


class _FakeMutationBuilder:
    def __init__(self, table_name: str) -> None:
        self.table_name = table_name
        self.inserted: dict[str, object] | None = None
        self.updated: dict[str, object] | None = None
        self.selected: str | None = None
        self.filters: list[tuple[str, object]] = []

    def insert(self, payload: dict[str, object]):
        self.inserted = payload
        return self

    def update(self, payload: dict[str, object]):
        self.updated = payload
        return self

    def select(self, fields: str):
        self.selected = fields
        return self

    def eq(self, key: str, value: object):
        self.filters.append((key, value))
        return self


def test_upsert_user_model_settings_updates_without_select(monkeypatch):
    builder = _FakeUpdateBuilder()
    settings_reads = [
        {
            "user_role": "premium",
            "profile_gender": "",
            "profile_age": None,
            "profile_photo_path": "profiles/user-1/reference.jpg",
            "enable_outfit_image_generation": False,
            "enable_online_store_search": False,
            "enable_accessory_analysis": False,
        },
        {
            "user_role": "premium",
            "profile_gender": "male",
            "profile_age": 40,
            "profile_photo_path": "profiles/user-1/reference.jpg",
            "enable_outfit_image_generation": True,
            "enable_online_store_search": False,
            "enable_accessory_analysis": True,
        },
    ]

    monkeypatch.setattr(supabase_module, "_table", lambda name: builder)
    monkeypatch.setattr(
        supabase_module,
        "get_user_model_settings",
        lambda user_id: settings_reads.pop(0),
    )
    monkeypatch.setattr(
        supabase_module,
        "get_signed_image_url",
        lambda storage_path: f"https://cdn.example/{storage_path}" if storage_path else None,
    )

    result = supabase_module.upsert_user_model_settings(
        "user-1",
        {
            "profile_gender": "male",
            "profile_age": "40",
            "enable_outfit_image_generation": True,
            "enable_online_store_search": False,
            "enable_accessory_analysis": True,
        },
    )

    assert builder.executed is True
    assert builder.filters == [("user_id", "user-1")]
    assert builder.updated is not None
    assert builder.updated["profile_gender"] == "male"
    assert builder.updated["profile_age"] == 40
    assert builder.updated["enable_outfit_image_generation"] is True
    assert builder.updated["enable_online_store_search"] is False
    assert builder.updated["enable_accessory_analysis"] is True
    assert builder.updated["updated_at"]
    assert result == {
        "user_role": "premium",
        "profile_gender": "male",
        "profile_age": 40,
        "profile_photo_path": "profiles/user-1/reference.jpg",
        "profile_photo_url": "https://cdn.example/profiles/user-1/reference.jpg",
        "enable_outfit_image_generation": True,
        "enable_online_store_search": False,
        "enable_accessory_analysis": True,
    }


def test_create_photo_and_ai_jobs_insert_without_select(monkeypatch):
    builders: list[_FakeMutationBuilder] = []
    mutation_calls: list[_FakeMutationBuilder] = []
    row_calls: list[_FakeMutationBuilder] = []

    def fake_table(name: str) -> _FakeMutationBuilder:
        builder = _FakeMutationBuilder(name)
        builders.append(builder)
        return builder

    def fake_execute_mutation(builder: _FakeMutationBuilder):
        mutation_calls.append(builder)
        return None

    def fake_execute_row(builder: _FakeMutationBuilder):
        row_calls.append(builder)
        if builder.table_name == "photos":
            return {
                "id": "photo-uuid",
                "user_id": "user-1",
                "storage_path": "user-1/photos/source.jpg",
                "created_at": "2026-03-24T06:00:00+00:00",
            }
        return {
            "id": builder.filters[0][1],
            "user_id": "user-1",
            "photo_id": "photo-uuid",
            "job_type": "analysis" if builder.filters[0][1] == "job-analysis-uuid" else "try_on",
            "status": "pending" if builder.filters[0][1] == "job-analysis-uuid" else "completed",
            "model_used": "gemini-2.5-flash",
        }

    uuids = iter(["photo-uuid", "job-analysis-uuid", "job-completed-uuid"])

    monkeypatch.setattr(supabase_module, "_table", fake_table)
    monkeypatch.setattr(supabase_module, "_execute_mutation", fake_execute_mutation)
    monkeypatch.setattr(supabase_module, "_execute_row", fake_execute_row)
    monkeypatch.setattr(supabase_module, "uuid4", lambda: next(uuids))

    photo = supabase_module.create_photo_record("user-1", "user-1/photos/source.jpg")
    analysis_job = supabase_module.create_analysis_job(
        "user-1",
        photo_id="photo-uuid",
        model_used="gemini-2.5-flash",
    )
    completed_job = supabase_module.create_completed_ai_job(
        "user-1",
        photo_id="photo-uuid",
        model_used="gemini-2.5-flash-image",
        job_type="try_on",
        tokens_input=12,
        tokens_output=34,
    )

    assert photo["id"] == "photo-uuid"
    assert analysis_job["id"] == "job-analysis-uuid"
    assert completed_job["id"] == "job-completed-uuid"

    assert [builder.table_name for builder in mutation_calls] == ["photos", "ai_jobs", "ai_jobs"]
    assert mutation_calls[0].inserted == {
        "id": "photo-uuid",
        "user_id": "user-1",
        "storage_path": "user-1/photos/source.jpg",
    }
    assert mutation_calls[1].inserted is not None
    assert mutation_calls[1].inserted["id"] == "job-analysis-uuid"
    assert mutation_calls[1].inserted["job_type"] == "analysis"
    assert mutation_calls[1].selected is None
    assert mutation_calls[2].inserted is not None
    assert mutation_calls[2].inserted["id"] == "job-completed-uuid"
    assert mutation_calls[2].inserted["job_type"] == "try_on"
    assert mutation_calls[2].inserted["tokens_input"] == 12
    assert mutation_calls[2].inserted["tokens_output"] == 34
    assert mutation_calls[2].selected is None

    assert row_calls[0].table_name == "photos"
    assert row_calls[0].selected == "id, user_id, storage_path, created_at"
    assert row_calls[0].filters == [("id", "photo-uuid"), ("user_id", "user-1")]
    assert row_calls[1].table_name == "ai_jobs"
    assert row_calls[1].filters == [("id", "job-analysis-uuid"), ("user_id", "user-1")]
    assert row_calls[2].table_name == "ai_jobs"
    assert row_calls[2].filters == [("id", "job-completed-uuid"), ("user_id", "user-1")]


def test_update_wardrobe_outfit_style_label_updates_without_select(monkeypatch):
    builders: list[_FakeMutationBuilder] = []
    mutation_calls: list[_FakeMutationBuilder] = []
    row_calls: list[_FakeMutationBuilder] = []

    def fake_table(name: str) -> _FakeMutationBuilder:
        builder = _FakeMutationBuilder(name)
        builders.append(builder)
        return builder

    def fake_execute_mutation(builder: _FakeMutationBuilder):
        mutation_calls.append(builder)
        return None

    def fake_execute_row(builder: _FakeMutationBuilder):
        row_calls.append(builder)
        return {
            "id": "outfit-123",
            "photo_id": "photo-123",
            "style_label": "Weekend Layers",
            "created_at": "2026-03-24T06:30:00+00:00",
        }

    monkeypatch.setattr(supabase_module, "_table", fake_table)
    monkeypatch.setattr(supabase_module, "_execute_mutation", fake_execute_mutation)
    monkeypatch.setattr(supabase_module, "_execute_row", fake_execute_row)

    result = supabase_module.update_wardrobe_outfit_style_label(
        "user-1",
        "outfit-123",
        "weekend layers",
    )

    assert mutation_calls[0].table_name == "outfits"
    assert mutation_calls[0].updated == {"style_label": "Weekend Layers"}
    assert mutation_calls[0].filters == [("id", "outfit-123"), ("user_id", "user-1")]
    assert mutation_calls[0].selected is None
    assert row_calls[0].table_name == "outfits"
    assert row_calls[0].selected == "*"
    assert row_calls[0].filters == [("id", "outfit-123"), ("user_id", "user-1")]
    assert result == {
        "outfit_id": "outfit-123",
        "photo_id": "photo-123",
        "style_label": "Weekend Layers",
        "created_at": "2026-03-24T06:30:00+00:00",
    }


def test_get_user_daily_ai_usage_returns_counted_actions(monkeypatch):
    class _FakeUsageBuilder:
        def __init__(self) -> None:
            self.selected: str | None = None
            self.filters: list[tuple[str, object]] = []

        def select(self, fields: str):
            self.selected = fields
            return self

        def eq(self, key: str, value: object):
            self.filters.append((key, value))
            return self

        def gte(self, key: str, value: object):
            self.filters.append((f"{key}__gte", value))
            return self

    builder = _FakeUsageBuilder()

    monkeypatch.setattr(supabase_module, "_table", lambda name: builder)
    monkeypatch.setattr(
        supabase_module,
        "_execute_rows",
        lambda query_builder: [
            {"job_type": "analysis"},
            {"job_type": "analysis"},
            {"job_type": "try_on"},
        ],
    )

    result = supabase_module.get_user_daily_ai_usage("user-1", "2026-03-24T00:00:00+00:00")

    assert result == {
        "analysis_actions_today": 2,
        "outfit_generations_today": 1,
    }
    assert builder.selected == "job_type"
    assert builder.filters == [
        ("user_id", "user-1"),
        ("created_at__gte", "2026-03-24T00:00:00+00:00"),
    ]


def test_get_wardrobe_photo_details_preserves_custom_outfit_source_type(monkeypatch):
    monkeypatch.setattr(
        supabase_module,
        "_execute_row",
        lambda builder: {
            "id": "photo-1",
            "storage_path": "user-1/generated/look.jpg",
            "created_at": "2026-03-24T07:00:00+00:00",
        },
    )
    monkeypatch.setattr(
        supabase_module,
        "_load_outfit_rows_for_photo",
        lambda user_id, photo_id: [
            {
                "id": "outfit-1",
                "outfit_index": 0,
                "style_label": "Evening Look",
                "generated_image_path": "user-1/generated/look.jpg",
            }
        ],
    )
    monkeypatch.setattr(supabase_module, "_load_items_for_outfits", lambda outfit_ids: {})
    monkeypatch.setattr(
        supabase_module,
        "get_signed_image_url",
        lambda storage_path: f"https://cdn.example/{storage_path}" if storage_path else None,
    )

    result = supabase_module.get_wardrobe_photo_details("user-1", "photo-1", outfit_index=0)

    assert result is not None
    assert result["selected_outfit"]["source_type"] == "custom_outfit"
    assert result["selected_outfit"]["image_url"] == "https://cdn.example/user-1/generated/look.jpg"


def test_get_wardrobe_photo_details_marks_try_on_entries_as_generated(monkeypatch):
    monkeypatch.setattr(
        supabase_module,
        "_execute_row",
        lambda builder: {
            "id": "photo-2",
            "storage_path": "user-1/generated/try-on.jpg",
            "created_at": "2026-03-24T07:30:00+00:00",
        },
    )
    monkeypatch.setattr(
        supabase_module,
        "_load_outfit_rows_for_photo",
        lambda user_id, photo_id: [
            {
                "id": "outfit-2",
                "outfit_index": 0,
                "style_label": "Weekend Layers",
                "generated_image_path": "user-1/generated/try-on.jpg",
                "job_type": "try_on",
            }
        ],
    )
    monkeypatch.setattr(supabase_module, "_load_items_for_outfits", lambda outfit_ids: {})
    monkeypatch.setattr(
        supabase_module,
        "get_signed_image_url",
        lambda storage_path: f"https://cdn.example/{storage_path}" if storage_path else None,
    )

    result = supabase_module.get_wardrobe_photo_details("user-1", "photo-2", outfit_index=0)

    assert result is not None
    assert result["selected_outfit"]["source_type"] == "outfitsme_generated"
    assert result["selected_outfit"]["image_url"] == "https://cdn.example/user-1/generated/try-on.jpg"
