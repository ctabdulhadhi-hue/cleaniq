import io
import pytest
import pandas as pd
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def upload_sample_csv(csv_content: str, filename: str = "sample.csv") -> str:
    """Helper to upload a dataset and return its dataset_id."""
    file_bytes = csv_content.encode("utf-8")
    resp = client.post(
        "/api/v1/datasets",
        files={"file": (filename, io.BytesIO(file_bytes), "text/csv")},
    )
    assert resp.status_code == 201
    return resp.json()["dataset_id"]


# ─── Module 1 Tests: Data Type Conversion ───────────────────────────────────


def test_type_suggestions_and_conversion():
    csv_data = (
        "id,user_age,registered_date,is_active\n"
        "1,25.0,2023-01-15,true\n"
        "2,30.0,2023-02-20,false\n"
        "3,35.0,2023-03-25,true\n"
    )
    dataset_id = upload_sample_csv(csv_data)

    # 1. Suggestions endpoint
    res = client.get(f"/api/v1/datasets/{dataset_id}/clean/type-suggestions")
    assert res.status_code == 200
    data = res.json()
    assert "suggestions" in data
    suggestions = {s["column"]: s for s in data["suggestions"]}

    # user_age should be suggested as integer with high confidence
    assert "user_age" in suggestions
    assert suggestions["user_age"]["suggested_type"] == "integer"
    assert suggestions["user_age"]["confidence"] >= 0.8

    # registered_date should be suggested as datetime
    assert "registered_date" in suggestions
    assert suggestions["registered_date"]["suggested_type"] == "datetime"

    # 2. Preview conversion
    preview_res = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/convert-type?preview=true",
        json={"column": "user_age", "target_type": "integer"},
    )
    assert preview_res.status_code == 200
    pdata = preview_res.json()
    assert pdata["operation_id"] is None
    assert "Converted to integer" in pdata["after_summary"]

    # Verify not mutated yet
    prof_before = client.get(f"/api/v1/datasets/{dataset_id}/profile").json()
    age_col = next(c for c in prof_before["columns"] if c["name"] == "user_age")
    assert age_col["type"] in ("numerical", "categorical")

    # 3. Apply conversion
    apply_res = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/convert-type?preview=false",
        json={"column": "user_age", "target_type": "integer"},
    )
    assert apply_res.status_code == 200
    adata = apply_res.json()
    assert adata["operation_id"] is not None

    # Check operation log
    ops = client.get(f"/api/v1/datasets/{dataset_id}/operations").json()
    assert any(op["operation"] == "convert_type" for op in ops["entries"])


# ─── Module 2 Tests: Text Cleaning & Standardization ────────────────────────


def test_text_transform_trim_case_and_replace():
    csv_data = (
        "name,dept\n"
        "  Alice  ,hr\n"
        " Bob ,engineering\n"
        " Charlie ,finance\n"
    )
    dataset_id = upload_sample_csv(csv_data)

    # 1. Trim preview and apply
    res = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/text/transform?preview=false",
        json={"column": "name", "operation": "trim"},
    )
    assert res.status_code == 200
    assert res.json()["affected_rows"] == 3

    # Check preview table
    preview = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    names = [r["name"] for r in preview["rows"]]
    assert names == ["Alice", "Bob", "Charlie"]

    # 2. Case transform
    res_case = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/text/transform?preview=false",
        json={"column": "dept", "operation": "case", "case_type": "title"},
    )
    assert res_case.status_code == 200
    preview = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    depts = [r["dept"] for r in preview["rows"]]
    assert depts == ["Hr", "Engineering", "Finance"]


def test_standardize_categories_clustering():
    csv_data = (
        "region,sales\n"
        "Sales,100\n"
        "sales,150\n"
        " SALES ,200\n"
        "Marketing,300\n"
        "marketing,250\n"
        "Other,50\n"
    )
    dataset_id = upload_sample_csv(csv_data)

    # 1. Fetch clusters
    cluster_res = client.get(
        f"/api/v1/datasets/{dataset_id}/clean/text/clusters?column=region&threshold=0.85"
    )
    assert cluster_res.status_code == 200
    cdata = cluster_res.json()
    assert len(cdata["clusters"]) >= 2

    # Check Sales cluster
    sales_cluster = next((c for c in cdata["clusters"] if "sales" in c["canonical"].lower()), None)
    assert sales_cluster is not None
    assert sales_cluster["total_affected"] >= 2

    # 2. Apply standardize
    merge_req = {
        "column": "region",
        "merges": [
            {
                "canonical": sales_cluster["canonical"],
                "variants": [v["value"] for v in sales_cluster["variants"]],
            }
        ],
    }
    apply_res = client.post(
        f"/api/v1/datasets/{dataset_id}/clean/text/standardize?preview=false",
        json=merge_req,
    )
    assert apply_res.status_code == 200
    adata = apply_res.json()
    assert adata["affected_rows"] >= 2

    # Verify rows in preview
    preview = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    sales_rows = [r["region"] for r in preview["rows"] if "sales" in str(r["region"]).lower()]
    assert all(r == sales_cluster["canonical"] for r in sales_rows)


# ─── Module 3 Tests: Column Management & Safe Evaluator ─────────────────────


def test_column_rename_delete_and_reorder():
    csv_data = "a,b,c\n1,2,3\n4,5,6\n"
    dataset_id = upload_sample_csv(csv_data)

    # 1. Rename column
    rename_res = client.post(
        f"/api/v1/datasets/{dataset_id}/columns/rename?preview=false",
        json={"old_name": "a", "new_name": "alpha"},
    )
    assert rename_res.status_code == 200
    preview = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    assert "alpha" in preview["columns"]
    assert "a" not in preview["columns"]

    # 2. Reorder columns
    reorder_res = client.post(
        f"/api/v1/datasets/{dataset_id}/columns/reorder?preview=false",
        json={"column_order": ["c", "b", "alpha"]},
    )
    assert reorder_res.status_code == 200
    preview = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    assert preview["columns"] == ["c", "b", "alpha"]

    # 3. Delete column
    delete_res = client.post(
        f"/api/v1/datasets/{dataset_id}/columns/delete?preview=false",
        json={"column": "c"},
    )
    assert delete_res.status_code == 200
    preview = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    assert "c" not in preview["columns"]
    assert preview["columns"] == ["b", "alpha"]


def test_calculated_column_with_asteval():
    csv_data = (
        "price,quantity\n"
        "10.5,2\n"
        "20.0,3\n"
        "5.0,4\n"
    )
    dataset_id = upload_sample_csv(csv_data)

    # 1. Preview calculation
    calc_preview = client.post(
        f"/api/v1/datasets/{dataset_id}/columns/calculate?preview=true",
        json={"new_column": "total", "expression": "price * quantity"},
    )
    assert calc_preview.status_code == 200
    pdata = calc_preview.json()
    assert pdata["operation_id"] is None
    assert "total" in pdata["after_summary"]
    assert pdata["sample_rows"] is not None

    # Verify not yet in dataset
    preview_before = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    assert "total" not in preview_before["columns"]

    # 2. Apply calculation
    calc_apply = client.post(
        f"/api/v1/datasets/{dataset_id}/columns/calculate?preview=false",
        json={"new_column": "total", "expression": "price * quantity"},
    )
    assert calc_apply.status_code == 200
    adata = calc_apply.json()
    assert adata["operation_id"] is not None

    # Verify column exists and values are accurate
    preview_after = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    assert "total" in preview_after["columns"]
    totals = [r["total"] for r in preview_after["rows"]]
    assert totals == [21.0, 60.0, 20.0]

    # 3. Test mathematical function: round(sqrt(total), 2)
    calc_fn = client.post(
        f"/api/v1/datasets/{dataset_id}/columns/calculate?preview=false",
        json={"new_column": "sqrt_val", "expression": "round(sqrt(total), 2)"},
    )
    assert calc_fn.status_code == 200
    preview_fn = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    assert "sqrt_val" in preview_fn["columns"]

    # 4. Security test: dangerous expressions must be rejected by asteval
    unsafe_res = client.post(
        f"/api/v1/datasets/{dataset_id}/columns/calculate?preview=true",
        json={"new_column": "hacked", "expression": "__import__('os').system('echo hacked')"},
    )
    assert unsafe_res.status_code == 400


def test_rollback_advanced_operation():
    csv_data = "x,y\n1,10\n2,20\n"
    dataset_id = upload_sample_csv(csv_data)

    # Add calculated column
    client.post(
        f"/api/v1/datasets/{dataset_id}/columns/calculate?preview=false",
        json={"new_column": "sum_xy", "expression": "x + y"},
    )
    preview = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    assert "sum_xy" in preview["columns"]

    # Rollback
    rb_res = client.post(f"/api/v1/datasets/{dataset_id}/rollback")
    assert rb_res.status_code == 200

    # Column should no longer be present
    preview_rolled = client.get(f"/api/v1/datasets/{dataset_id}/preview?page=1&size=10").json()
    assert "sum_xy" not in preview_rolled["columns"]
