import io

import pytest

from app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


def test_analyze_requires_token(client):
    response = client.post(
        "/api/analyze",
        data={"image": (io.BytesIO(b"x"), "outfit.jpg")},
        content_type="multipart/form-data"
    )

    assert response.status_code == 401
    assert response.get_json()["error"] == "Missing bearer token."


def test_similar_requires_token(client):
    response = client.post("/api/similar", json={"items": []})

    assert response.status_code == 401
    assert response.get_json()["error"] == "Missing bearer token."


def test_wardrobe_requires_token(client):
    response = client.get("/api/wardrobe")

    assert response.status_code == 401
    assert response.get_json()["error"] == "Missing bearer token."


def test_analyze_job_requires_token(client):
    response = client.get("/api/analyze/jobs/test-job-id")

    assert response.status_code == 401
    assert response.get_json()["error"] == "Missing bearer token."


def test_analyze_requires_image(client):
    response = client.post(
        "/api/analyze",
        headers={"Authorization": "Bearer test-token"},
        content_type="multipart/form-data"
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "Image file is required."
