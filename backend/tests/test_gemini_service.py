from __future__ import annotations

from app.services.gemini_service import _build_prompt


def test_build_prompt_excludes_accessories_by_default():
    prompt = _build_prompt()

    assert "Only return clothing/apparel items" in prompt
    assert "Do not include accessories" in prompt
    assert "clearly visible accessories that are worn or carried" not in prompt


def test_build_prompt_includes_accessories_when_enabled():
    prompt = _build_prompt(include_accessories=True)

    assert "Return all visible outfit items." in prompt
    assert "include clearly visible accessories that are worn or carried" in prompt
    assert "Do not include accessories" not in prompt
