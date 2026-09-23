from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok_shape() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "vision-service", "version": "0.2.0"}
