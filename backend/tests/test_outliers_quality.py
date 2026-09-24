import io
import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services.outliers import OutlierDetectorService
from app.services.quality import QualityScoreService
from app.core.session_store import session_store

client = TestClient(app)


def test_outlier_detection_iqr():
    # Generate data with known outliers
    data = [10, 12, 11, 14, 13, 12, 11, 100, -50, 12, 13]
    df = pd.DataFrame({"val": data})

    res = OutlierDetectorService.detect(df, "val", method="iqr", multiplier=1.5)
    assert res["outlier_count"] == 2
    assert res["percentage"] > 0
    assert len(res["sample_outliers"]) == 2


def test_outlier_detection_zscore():
    # 20 points centered at 10, plus one extreme value 1000
    data = [10.0] * 20 + [1000.0]
    df = pd.DataFrame({"val": data})

    res = OutlierDetectorService.detect(df, "val", method="zscore", zscore_threshold=3.0)
    assert res["outlier_count"] == 1
    assert res["sample_outliers"][0]["value"] == 1000.0


def test_outlier_handling_remove():
    data = [10, 12, 11, 14, 13, 12, 11, 100, -50, 12, 13]
    df = pd.DataFrame({"val": data})

    res_df, affected, msg = OutlierDetectorService.handle_outliers(
        df, "val", method="iqr", action="remove"
    )
    assert affected == 2
    assert len(res_df) == 9
    assert 100 not in res_df["val"].values


def test_outlier_handling_cap():
    data = [10, 12, 11, 14, 13, 12, 11, 100, -50, 12, 13]
    df = pd.DataFrame({"val": data})

    res_df, affected, msg = OutlierDetectorService.handle_outliers(
        df, "val", method="iqr", action="cap"
    )
    assert affected == 2
    assert len(res_df) == 11
    assert res_df["val"].max() < 100


def test_quality_score_clean():
    df = pd.DataFrame({
        "id": [1, 2, 3, 4],
        "name": ["Alice", "Bob", "Charlie", "David"],
        "age": [25, 30, 35, 40]
    })
    res = QualityScoreService.compute(df)
    assert res["overall_score"] > 0.9
    assert len(res["sub_scores"]) == 4


def test_quality_score_dirty():
    df = pd.DataFrame({
        "id": [1, 1, 2, None], # duplicates and missing
        "cat": ["Sales", "sales", " SALES ", None], # inconsistent
        "num": [10, "abc", 30, 40] # type issues
    })
    res = QualityScoreService.compute(df)
    assert res["overall_score"] < 0.9


def test_outlier_quality_api_endpoints():
    # Upload test CSV via client
    csv_bytes = "col1,col2\n10,A\n12,B\n11,A\n1000,C\n13,B\n".encode("utf-8")
    response = client.post(
        "/api/v1/datasets",
        files={"file": ("test.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert response.status_code == 201
    dataset_id = response.json()["dataset_id"]

    # Test Quality Endpoint
    q_resp = client.get(f"/api/v1/datasets/{dataset_id}/quality")
    assert q_resp.status_code == 200
    q_data = q_resp.json()
    assert "overall_score" in q_data
    assert len(q_data["sub_scores"]) == 4

    # Test Outlier Detect Endpoint
    det_resp = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/outliers/detect",
        json={"column": "col1", "method": "iqr", "multiplier": 1.5}
    )
    assert det_resp.status_code == 200
    det_data = det_resp.json()
    assert det_data["outlier_count"] == 1

    # Test Outlier Handle Preview
    h_prev = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/outliers/handle?preview=true",
        json={"column": "col1", "method": "iqr", "action": "remove"}
    )
    assert h_prev.status_code == 200
    assert h_prev.json()["affected_rows"] == 1

    # Test Visualization Endpoints
    hist_resp = client.get(f"/api/v1/datasets/{dataset_id}/viz/histogram?column=col1")
    assert hist_resp.status_code == 200
    assert len(hist_resp.json()["buckets"]) > 0

    box_resp = client.get(f"/api/v1/datasets/{dataset_id}/viz/boxplot?column=col1")
    assert box_resp.status_code == 200
    assert "q1" in box_resp.json()

    corr_resp = client.get(f"/api/v1/datasets/{dataset_id}/viz/correlation")
    assert corr_resp.status_code == 200
