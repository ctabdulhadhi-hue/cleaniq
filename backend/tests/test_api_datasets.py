import io
import pytest
from fastapi.testclient import TestClient
import pandas as pd

from app.main import app
from app.core.session_store import session_store

client = TestClient(app)


def test_upload_valid_csv():
    csv_data = "name,age,city\nAlice,30,New York\nBob,25,San Francisco\nCharlie,35,Boston\n"
    file_bytes = csv_data.encode("utf-8")

    response = client.post(
        "/api/v1/datasets",
        files={"file": ("users.csv", io.BytesIO(file_bytes), "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert "dataset_id" in data
    assert data["row_count"] == 3
    assert data["column_count"] == 3
    assert data["filename"] == "users.csv"

    dataset_id = data["dataset_id"]
    # Check that session store has the dataset
    assert session_store.get(dataset_id) is not None


def test_upload_corrupt_content_rejected():
    # File named .csv or .xlsx but with random unparseable binary content
    garbage_bytes = b"\x00\x01\x02\x03\x04\x05\x06\x07\xff\xfe\xaa\xbb\xcc\xdd\xee"

    response = client.post(
        "/api/v1/datasets",
        files={"file": ("corrupt.csv", io.BytesIO(garbage_bytes), "text/csv")},
    )

    assert response.status_code == 400
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] in ("INVALID_FILE_CONTENT", "EMPTY_DATASET")


def test_upload_empty_file_rejected():
    response = client.post(
        "/api/v1/datasets",
        files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
    )

    assert response.status_code == 400
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "EMPTY_FILE"


def test_get_dataset_profile():
    # Seed a dataset in session store
    df = pd.DataFrame({
        "product_id": [1, 2, 3, 4],
        "category": ["A", "B", "A", "C"],
        "price": [10.5, 20.0, None, 45.0],
        "in_stock": [True, False, True, True],
    })
    session_store.set("test_seed_profile", df)

    response = client.get("/api/v1/datasets/test_seed_profile/profile")
    assert response.status_code == 200
    profile = response.json()

    assert profile["dataset_id"] == "test_seed_profile"
    assert profile["row_count"] == 4
    assert profile["column_count"] == 4
    assert profile["duplicate_row_count"] == 0
    assert profile["type_summary"]["numerical"] == 2
    assert profile["type_summary"]["categorical"] == 1
    assert profile["type_summary"]["boolean"] == 1


def test_get_dataset_profile_not_found():
    response = client.get("/api/v1/datasets/non_existent_id/profile")
    assert response.status_code == 404
    data = response.json()
    assert data["error"]["code"] == "DATASET_NOT_FOUND"


def test_get_dataset_preview_pagination():
    # Seed a dataset with 250 rows
    df = pd.DataFrame({
        "index": list(range(250)),
        "label": [f"item_{i}" for i in range(250)],
    })
    session_store.set("test_seed_preview", df)

    # Page 1, default size 100
    res_p1 = client.get("/api/v1/datasets/test_seed_preview/preview")
    assert res_p1.status_code == 200
    d1 = res_p1.json()
    assert d1["page"] == 1
    assert d1["size"] == 100
    assert d1["total_rows"] == 250
    assert d1["total_pages"] == 3
    assert d1["has_next"] is True
    assert d1["has_prev"] is False
    assert len(d1["rows"]) == 100
    assert d1["rows"][0]["index"] == 0
    assert d1["rows"][99]["index"] == 99

    # Page 3, size 100 (should have 50 rows remaining)
    res_p3 = client.get("/api/v1/datasets/test_seed_preview/preview?page=3&size=100")
    assert res_p3.status_code == 200
    d3 = res_p3.json()
    assert d3["page"] == 3
    assert d3["has_next"] is False
    assert d3["has_prev"] is True
    assert len(d3["rows"]) == 50
    assert d3["rows"][0]["index"] == 200
    assert d3["rows"][49]["index"] == 249


def test_get_dataset_preview_not_found():
    response = client.get("/api/v1/datasets/non_existent_id/preview")
    assert response.status_code == 404
    data = response.json()
    assert data["error"]["code"] == "DATASET_NOT_FOUND"


def test_upload_valid_xlsx():
    # Create an in-memory excel workbook
    df = pd.DataFrame({"col_a": [10, 20, 30], "col_b": ["apple", "banana", "cherry"]})
    excel_buffer = io.BytesIO()
    with pd.ExcelWriter(excel_buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False)
    excel_bytes = excel_buffer.getvalue()

    response = client.post(
        "/api/v1/datasets",
        files={"file": ("sample.xlsx", io.BytesIO(excel_bytes), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["row_count"] == 3
    assert data["column_count"] == 2
    assert "dataset_id" in data


def test_upload_file_exceeds_50mb():
    from app.services.file_parser import MAX_FILE_SIZE_BYTES
    # Simulate a file larger than 50MB
    oversized_bytes = b"a" * (MAX_FILE_SIZE_BYTES + 2048)

    response = client.post(
        "/api/v1/datasets",
        files={"file": ("huge.csv", io.BytesIO(oversized_bytes), "text/csv")},
    )
    assert response.status_code == 413
    data = response.json()
    assert data["error"]["code"] == "FILE_TOO_LARGE"


def test_clean_missing_preview_does_not_mutate():
    df = pd.DataFrame({
        "name": ["Alice", "Bob", "Charlie", "David"],
        "age": [20.0, None, 40.0, None],
    })
    dataset_id = "test_clean_missing_preview"
    session_store.set(dataset_id, df)

    res = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/missing?preview=true",
        json={"column": "age", "method": "mean"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["affected_rows"] == 2
    assert "mean" in data["after_summary"].lower()
    assert data["operation_id"] is None

    # Verify session df was NOT mutated
    curr_df = session_store.get(dataset_id)
    assert curr_df["age"].isna().sum() == 2

    # Verify operation log is empty
    log_res = client.get(f"/api/v1/datasets/{dataset_id}/operations")
    assert log_res.status_code == 200
    assert log_res.json()["total"] == 0


def test_clean_missing_apply_mutates_and_logs():
    df = pd.DataFrame({
        "name": ["Alice", "Bob", "Charlie"],
        "score": [10.0, None, 30.0],
    })
    dataset_id = "test_clean_missing_apply"
    session_store.set(dataset_id, df)

    res = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/missing?preview=false",
        json={"column": "score", "method": "mean"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["affected_rows"] == 1
    assert data["operation_id"] is not None

    # Verify session df was mutated
    curr_df = session_store.get(dataset_id)
    assert curr_df["score"].isna().sum() == 0
    assert curr_df.loc[1, "score"] == 20.0

    # Verify operation log has entry
    log_res = client.get(f"/api/v1/datasets/{dataset_id}/operations")
    assert log_res.status_code == 200
    entries = log_res.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["operation"] == "clean_missing"
    assert entries[0]["column"] == "score"
    assert entries[0]["method"] == "mean"
    assert entries[0]["affected_rows"] == 1


def test_clean_duplicates_preview_and_apply():
    df = pd.DataFrame({
        "a": [1, 2, 2, 3],
        "b": ["x", "y", "y", "z"],
    })
    dataset_id = "test_clean_dup"
    session_store.set(dataset_id, df)

    # Preview
    prev_res = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/duplicates?preview=true",
        json={},
    )
    assert prev_res.status_code == 200
    prev_data = prev_res.json()
    assert prev_data["affected_rows"] == 1
    assert prev_data["sample_rows"] is not None
    assert len(prev_data["sample_rows"]) == 1
    assert len(session_store.get(dataset_id)) == 4

    # Apply
    apply_res = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/duplicates?preview=false",
        json={},
    )
    assert apply_res.status_code == 200
    assert len(session_store.get(dataset_id)) == 3

    # Check operation log
    log_res = client.get(f"/api/v1/datasets/{dataset_id}/operations")
    assert log_res.status_code == 200
    entries = log_res.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["operation"] == "clean_duplicates"


def test_rollback_operation():
    df = pd.DataFrame({
        "a": [1, 2, 2, 3],
    })
    dataset_id = "test_rollback"
    session_store.set(dataset_id, df)

    # Apply duplicates clean
    client.post(f"/api/v1/datasets/{dataset_id}/clean/duplicates?preview=false", json={})
    assert len(session_store.get(dataset_id)) == 3

    # Rollback
    rb_res = client.post(f"/api/v1/datasets/{dataset_id}/rollback")
    assert rb_res.status_code == 200
    assert rb_res.json()["rows_after"] == 4
    assert len(session_store.get(dataset_id)) == 4

    # Rollback again when history is empty
    empty_rb = client.post(f"/api/v1/datasets/{dataset_id}/rollback")
    assert empty_rb.status_code == 400
    assert empty_rb.json()["error"]["code"] == "NO_OPERATIONS"


def test_get_column_stats():
    df = pd.DataFrame({
        "num": [10.0, 20.0, 30.0, None],
        "cat": ["A", "B", "A", "C"],
    })
    dataset_id = "test_stats"
    session_store.set(dataset_id, df)

    res = client.get(f"/api/v1/datasets/{dataset_id}/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["row_count"] == 4
    assert data["column_count"] == 2
    cols = {c["name"]: c for c in data["columns"]}
    assert cols["num"]["mean"] == 20.0
    assert cols["num"]["missing_count"] == 1
    assert cols["cat"]["top_values"][0]["value"] == "A"


def test_load_sample_dataset():
    res = client.post("/api/v1/datasets/sample")
    assert res.status_code == 201
    data = res.json()
    assert data["filename"] == "sample_dataset.csv"
    assert data["row_count"] == 30
    assert data["column_count"] == 7
    assert data["is_sample"] is True
    dataset_id = data["dataset_id"]

    # Verify profile
    prof_res = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert prof_res.status_code == 200
    prof = prof_res.json()
    assert prof["is_sample"] is True
    assert prof["filename"] == "sample_dataset.csv"
    assert prof["duplicate_row_count"] == 3

    # Verify quality endpoint works on sample dataset
    q_res = client.get(f"/api/v1/datasets/{dataset_id}/quality")
    assert q_res.status_code == 200
    q_data = q_res.json()
    assert "overall_score" in q_data

    # Verify preview works
    prev_res = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10")
    assert prev_res.status_code == 200
    assert len(prev_res.json()["rows"]) == 10


