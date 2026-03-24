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
