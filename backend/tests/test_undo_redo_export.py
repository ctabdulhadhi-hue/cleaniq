import io
import pytest
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.core.session_store import session_store, DatasetSession, OperationRecord

client = TestClient(app)


def test_undo_redo_log_replay_session():
    df_init = pd.DataFrame({"col1": [10, 20, 30, 1000], "col2": ["A", "B", "C", "D"]})
    session = DatasetSession("test_session_1", df_init)

    # Step 1: remove outliers on col1 (> 100)
    rec1 = OperationRecord(
        operation="outlier_remove",
        params={"column": "col1", "method": "iqr", "action": "remove", "multiplier": 1.5},
        columns_affected=["col1"],
        affected_row_count=1,
        rows_before=4,
        rows_after=3,
    )
    session.push_operation(rec1)
    session.df = session.df[session.df["col1"] < 500].reset_index(drop=True)

    # Step 2: convert col1 to integer (simulated)
    rec2 = OperationRecord(
        operation="convert_type",
        params={"column": "col1", "target_type": "integer"},
        columns_affected=["col1"],
        affected_row_count=3,
        rows_before=3,
        rows_after=3,
    )
    session.push_operation(rec2)

    assert session.current_step == 2
    assert len(session.history) == 2
    assert len(session.df) == 3

    # Undo 1 step (back to step 1)
    session.undo()
    assert session.current_step == 1
    assert len(session.df) == 3

    # Undo to step 0 (initial state)
    session.undo()
    assert session.current_step == 0
    assert len(session.df) == 4
    assert 1000 in session.df["col1"].values

    # Redo step 1
    session.redo()
    assert session.current_step == 1
    assert len(session.df) == 3

    # Replay directly to step 2
    session.replay_to_step(2)
    assert session.current_step == 2
    assert len(session.df) == 3


def test_undo_redo_api_endpoints():
    csv_bytes = "col1,col2\n10,A\n12,B\n11,A\n1000,C\n".encode("utf-8")
    res = client.post(
        "/api/v1/datasets",
        files={"file": ("test.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert res.status_code == 201
    dataset_id = res.json()["dataset_id"]

    # Apply 1 cleaning op: remove duplicates (or outliers)
    client.post(
        f"/api/v1/datasets/{dataset_id}/clean/outliers/handle?preview=false",
        json={"column": "col1", "method": "iqr", "action": "remove"},
    )

    # Undo step via API
    undo_resp = client.post(f"/api/v1/datasets/{dataset_id}/undo")
    assert undo_resp.status_code == 200
    assert undo_resp.json()["current_step"] == 0
    assert undo_resp.json()["can_redo"] is True

    # Redo step via API
    redo_resp = client.post(f"/api/v1/datasets/{dataset_id}/redo")
    assert redo_resp.status_code == 200
    assert redo_resp.json()["current_step"] == 1
    assert redo_resp.json()["can_undo"] is True


def test_export_dataset_csv_and_xlsx():
    csv_bytes = "name,val\nAlpha,100\nBeta,200\n".encode("utf-8")
    res = client.post(
        "/api/v1/datasets",
        files={"file": ("export_test.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    dataset_id = res.json()["dataset_id"]

    # CSV Export
    csv_exp = client.get(f"/api/v1/datasets/{dataset_id}/export?format=csv")
    assert csv_exp.status_code == 200
    assert "text/csv" in csv_exp.headers["content-type"]
    assert "export_test_cleaned.csv" in csv_exp.headers["content-disposition"]

    # XLSX Export
    xlsx_exp = client.get(f"/api/v1/datasets/{dataset_id}/export?format=xlsx")
    assert xlsx_exp.status_code == 200
    assert "openxmlformats" in xlsx_exp.headers["content-type"]
    assert "export_test_cleaned.xlsx" in xlsx_exp.headers["content-disposition"]


def test_export_report_html_and_pdf():
    csv_bytes = "cat,val\nA,10\nB,20\nA,10\n".encode("utf-8")
    res = client.post(
        "/api/v1/datasets",
        files={"file": ("report_test.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    dataset_id = res.json()["dataset_id"]

    # HTML Report
    html_rep = client.get(f"/api/v1/datasets/{dataset_id}/export/report?format=html")
    assert html_rep.status_code == 200
    assert "text/html" in html_rep.headers["content-type"]
    assert "CleanIQ Audit Report" in html_rep.text

    # PDF Report
    pdf_rep = client.get(f"/api/v1/datasets/{dataset_id}/export/report?format=pdf")
    assert pdf_rep.status_code == 200
    assert pdf_rep.headers["content-type"] in ["application/pdf", "text/html"]
