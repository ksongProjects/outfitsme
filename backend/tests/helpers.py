from __future__ import annotations

import base64
import json
from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw


def make_image_bytes(
    *,
    size: tuple[int, int] = (32, 32),
    color: tuple[int, int, int] = (80, 120, 200),
    image_format: str = "PNG",
) -> bytes:
    image = Image.new("RGB", size, color)
    output = BytesIO()
    image.save(output, format=image_format)
    return output.getvalue()


def make_data_uri(
    *,
    size: tuple[int, int] = (32, 32),
    color: tuple[int, int, int] = (80, 120, 200),
    mime_type: str = "image/png",
    image_format: str = "PNG",
) -> str:
    encoded = base64.b64encode(
        make_image_bytes(size=size, color=color, image_format=image_format)
    ).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def make_sprite_data_uri() -> str:
    image = Image.new("RGB", (400, 400), (245, 245, 245))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 199, 199), fill=(220, 90, 90))
    draw.rectangle((200, 0, 399, 199), fill=(80, 140, 220))
    draw.rectangle((0, 200, 199, 399), fill=(120, 190, 120))
    draw.rectangle((200, 200, 399, 399), fill=(230, 200, 120))
    output = BytesIO()
    image.save(output, format="PNG")
    encoded = base64.b64encode(output.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def print_exchange(name: str, method: str, path: str, request_body: Any, response) -> None:
    payload = {
        "request": {
            "method": method,
            "path": path,
            "body": request_body,
        },
        "response": {
            "status": response.status_code,
            "body": response.get_json(silent=True),
        },
    }
    print(f"\n=== {name} ===")
    print(json.dumps(payload, indent=2, sort_keys=True, default=str))
