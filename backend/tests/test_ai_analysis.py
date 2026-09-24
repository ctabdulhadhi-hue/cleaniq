import pytest
import io
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.core.session_store import session_store
from app.services.ai_analyzer import AIAnalysisService

client = TestClient(app)


def test_ai_analysis_privacy_guard():
    """Verify that build_profile_metadata contains strictly metadata and no raw row data."""
    df = pd.DataFrame({
        "age": [25, 30, None, 45, 1000],
        "name": ["Alice", "Bob", "Charlie", "David", "Eve"],
        "secret_ssn": ["111-22-333", "222-33-444", "333-44-555", "444-55-666", "555-66-777"]
    })
    
    metadata = AIAnalysisService.build_profile_metadata(df, "test_dataset_123")
    
    # Assert top-level keys
    assert "shape" in metadata
    assert metadata["shape"] == [5, 3]
    assert "quality_score" in metadata
    assert "columns" in metadata
    
    # Assert NO raw values or row dictionary serialized in metadata
    meta_str = str(metadata)
    assert "Alice" not in meta_str
    assert "111-22-333" not in meta_str
    assert "secret_ssn" in meta_str or "columns" in metadata  # Column header is fine, raw rows are not!


def test_ai_analysis_endpoint_and_caching():
    """Test POST /api/v1/datasets/{id}/ai/analyze endpoint and verify caching per dataset + profile hash."""
    AIAnalysisService.clear_cache()
    
    # Upload sample file
    csv_content = b"age,income,category\n25,50000,Sales\n30,,sales\n35,60000, SALES \n,70000,Marketing\n"
    file = io.BytesIO(csv_content)
    file.name = "ai_test.csv"

    upload_res = client.post("/api/v1/datasets", files={"file": ("ai_test.csv", file, "text/csv")})
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    # 1st call - should not be cached
    res1 = client.post(f"/api/v1/datasets/{dataset_id}/ai/analyze")
    assert res1.status_code == 200
    data1 = res1.json()
    
    assert data1["dataset_id"] == dataset_id
    assert data1["cached"] is False
    assert len(data1["profile_hash"]) == 64
    assert isinstance(data1["recommendations"], list)
    assert len(data1["recommendations"]) > 0

    rec = data1["recommendations"][0]
    assert "id" in rec
    assert "issue" in rec
    assert "recommendation" in rec
    assert "reason" in rec
    assert "action_type" in rec
    assert "action_params" in rec

    # 2nd call - should be cached
    res2 = client.post(f"/api/v1/datasets/{dataset_id}/ai/analyze")
    assert res2.status_code == 200
    data2 = res2.json()

    assert data2["cached"] is True
    assert data2["profile_hash"] == data1["profile_hash"]
    assert len(data2["recommendations"]) == len(data1["recommendations"])
