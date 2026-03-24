from __future__ import annotations

from app.services.gemini_service import _build_outfitsme_generation_prompt, _build_prompt


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


def test_outfitsme_generation_prompt_forbids_extra_outfit_items():
    prompt = _build_outfitsme_generation_prompt(
        outfit_style="Business Casual",
        requested_items_text="1. type: top; name: Oxford Shirt",
        profile_parts=["gender: man", "age: 34"],
    )

    assert "Only the requested items may appear as visible outfit pieces" in prompt
    assert "Do not add, invent, replace, swap, or layer in any extra clothing items or accessories" in prompt
    assert "No extra jackets, shirts, pants, skirts, dresses, shoes, bags, hats, jewelry, scarves, belts" in prompt
    assert "match the requested outfit exactly" in prompt
