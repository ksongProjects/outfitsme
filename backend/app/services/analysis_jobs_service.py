from __future__ import annotations

import base64
import math
import mimetypes
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import requests
from PIL import Image, ImageOps

from app.services.gemini_service import analyze_outfit_with_gemini, generate_item_sprite_with_gemini
from app.services.supabase_service import (
    claim_analysis_job,
    download_photo_bytes,
    get_photo_storage_path_for_user,
    mark_analysis_job_completed,
    mark_analysis_job_failed,
    persist_analysis_for_photo,
    save_generated_item_image,
)


_JOB_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="analysis-job")


def _decode_data_uri_image(data_uri: str) -> tuple[bytes, str] | None:
    if not isinstance(data_uri, str) or not data_uri.startswith("data:image/"):
        return None
    parts = data_uri.split(",", 1)
    if len(parts) != 2:
        return None
    header, encoded = parts
    mime_type = header.split(";")[0].replace("data:", "") or "image/png"
    try:
        return base64.b64decode(encoded), mime_type
    except Exception:  # noqa: BLE001
        return None


def _build_sprite_grid(item_count: int) -> tuple[int, int]:
    if item_count <= 1:
        return 1, 1
    if item_count <= 4:
        return 2, 2
    if item_count <= 6:
        return 3, 2
    cols = 4
    rows = int(math.ceil(item_count / cols))
    return cols, rows


def _build_sprite_axis_bounds(axis_length: int, segment_count: int) -> list[int]:
    safe_axis_length = max(1, int(axis_length))
    safe_segment_count = max(1, int(segment_count))
    bounds = [
        min(safe_axis_length, max(0, (index * safe_axis_length) // safe_segment_count))
        for index in range(safe_segment_count)
    ]
    bounds.append(safe_axis_length)
    return bounds


def _build_inset_sprite_cell_bounds(
    *,
    left: int,
    top: int,
    right: int,
    bottom: int,
    col: int,
    row: int,
    grid_cols: int,
    grid_rows: int,
) -> tuple[int, int, int, int]:
    cell_width = max(1, right - left)
    cell_height = max(1, bottom - top)
    inset_x = min(max(1, int(round(cell_width * 0.015))), max(1, cell_width // 10))
    inset_y = min(max(1, int(round(cell_height * 0.015))), max(1, cell_height // 10))

    next_left = left + (inset_x if col > 0 else 0)
    next_top = top + (inset_y if row > 0 else 0)
    next_right = right - (inset_x if col < grid_cols - 1 else 0)
    next_bottom = bottom - (inset_y if row < grid_rows - 1 else 0)

    if next_right - next_left < max(8, cell_width // 3):
        next_left, next_right = left, right
    if next_bottom - next_top < max(8, cell_height // 3):
        next_top, next_bottom = top, bottom

    return next_left, next_top, next_right, next_bottom


def _slice_sprite_to_item_data_uris(
    sprite_data_uri: str,
    item_count: int,
    grid_cols: int,
    grid_rows: int,
) -> list[str]:
    decoded = _decode_data_uri_image(sprite_data_uri)
    if not decoded:
        return []
    image_bytes, _mime = decoded
    try:
        with Image.open(BytesIO(image_bytes)) as source:
            image = ImageOps.exif_transpose(source)
            width, height = image.size
            if width <= 0 or height <= 0:
                return []

            x_bounds = _build_sprite_axis_bounds(width, grid_cols)
            y_bounds = _build_sprite_axis_bounds(height, grid_rows)
            results = []
            for index in range(item_count):
                row = index // grid_cols
                col = index % grid_cols
                if row >= len(y_bounds) - 1 or col >= len(x_bounds) - 1:
                    continue
                left = x_bounds[col]
                top = y_bounds[row]
                right = x_bounds[col + 1]
                bottom = y_bounds[row + 1]
                left, top, right, bottom = _build_inset_sprite_cell_bounds(
                    left=left,
                    top=top,
                    right=right,
                    bottom=bottom,
                    col=col,
                    row=row,
                    grid_cols=grid_cols,
                    grid_rows=grid_rows,
                )
                if right <= left or bottom <= top:
                    continue
                crop = image.crop((left, top, right, bottom))
                if crop.mode not in {"RGB", "L"}:
                    crop = crop.convert("RGB")
                output = BytesIO()
                crop.save(output, format="JPEG", quality=90, optimize=True)
                encoded = base64.b64encode(output.getvalue()).decode("utf-8")
                results.append(f"data:image/jpeg;base64,{encoded}")
            return results
    except Exception:  # noqa: BLE001
        return []


def _generate_item_images(
    user_id: str,
    items: list[dict],
    *,
    source_image_bytes: bytes,
    source_mime_type: str,
) -> tuple[int, int]:
    if not items:
        return 0, 0

    grid_cols, grid_rows = _build_sprite_grid(len(items))
    sprite_data_uri, sprite_usage = generate_item_sprite_with_gemini(
        items,
        grid_cols=grid_cols,
        grid_rows=grid_rows,
        reference_image_bytes=source_image_bytes,
        reference_mime_type=source_mime_type,
        return_usage=True,
    )
    if not sprite_data_uri:
        return 0, 0

    cropped_data_uris = _slice_sprite_to_item_data_uris(sprite_data_uri, len(items), grid_cols, grid_rows)
    for index, item in enumerate(items):
        image_data_uri = cropped_data_uris[index] if index < len(cropped_data_uris) else None
        if not image_data_uri:
            continue
        save_generated_item_image(user_id, str(item["id"]), image_data_uri)

    return (
        int((sprite_usage or {}).get("input_tokens") or 0),
        int((sprite_usage or {}).get("output_tokens") or 0),
    )


def process_analysis_job(job_id: str) -> None:
    claimed = claim_analysis_job(job_id)
    if not claimed:
        return

    try:
        user_id = str(claimed["user_id"])
        photo_id = str(claimed["photo_id"] or "")
        model_used = str(claimed.get("model_used") or "")
        if not photo_id:
            raise ValueError("Job is missing photo_id.")

        storage_path = get_photo_storage_path_for_user(user_id, photo_id)
        if not storage_path:
            raise ValueError("Photo could not be found for this job.")

        image_bytes = download_photo_bytes(storage_path)
        if not image_bytes:
            raise ValueError("Stored image could not be loaded.")

        mime_type = mimetypes.guess_type(storage_path)[0] or "image/jpeg"
        analysis = analyze_outfit_with_gemini(image_bytes, mime_type, model=model_used or None)
        analysis_usage = analysis.pop("_usage", {}) if isinstance(analysis, dict) else {}

        persistence = persist_analysis_for_photo(user_id, photo_id, analysis, job_id=job_id)
        item_input_tokens, item_output_tokens = _generate_item_images(
            user_id,
            persistence.get("items") or [],
            source_image_bytes=image_bytes,
            source_mime_type=mime_type,
        )

        mark_analysis_job_completed(
            job_id,
            tokens_input=int(analysis_usage.get("input_tokens") or 0) + item_input_tokens,
            tokens_output=int(analysis_usage.get("output_tokens") or 0) + item_output_tokens,
        )
    except requests.HTTPError as exc:
        mark_analysis_job_failed(job_id, f"Model request failed: {exc}")
    except Exception as exc:  # noqa: BLE001
        mark_analysis_job_failed(job_id, f"Analyze failed: {exc}")


def enqueue_analysis_job_processing(job_id: str) -> None:
    _JOB_EXECUTOR.submit(process_analysis_job, job_id)
