from datetime import datetime
import pytest
import pandas as pd
import numpy as np

from app.services.profiler import (
    profile_dataframe,
    classify_column_type,
    format_bytes,
)


@pytest.fixture
def messy_dataframe() -> pd.DataFrame:
    """
    Returns a sample messy DataFrame containing:
    - Numerical column with NaNs (age, score)
    - Categorical/string column with missing and duplicate values (category, name)
    - Date column with valid dates and NaT (signup_date)
    - Boolean column with True, False, and None (is_verified)
    - Duplicate rows (row 0 and row 1 are identical duplicates)
    """
    data = {
        "user_id": [101, 101, 103, 104, 105, 106, 107],
        "name": ["Alice", "Alice", "Charlie", None, "Eva", "Frank", "Grace"],
        "age": [25.0, 25.0, np.nan, 32.0, -5.0, np.nan, 45.0],
        "signup_date": [
            pd.Timestamp("2023-01-15"),
            pd.Timestamp("2023-01-15"),
            pd.NaT,
            pd.Timestamp("2023-04-10"),
            pd.Timestamp("2023-05-22"),
            pd.NaT,
            pd.Timestamp("2023-07-01"),
        ],
        "is_verified": [True, True, False, None, True, False, True],
        "category": ["A", "A", "B", "C", "B", "A", "C"],
    }
    return pd.DataFrame(data)


def test_profile_dataframe_counts(messy_dataframe):
    profile = profile_dataframe(messy_dataframe, dataset_id="test_ds_1")

    assert profile.dataset_id == "test_ds_1"
    assert profile.row_count == 7
    assert profile.column_count == 6


def test_profile_dataframe_duplicate_rows(messy_dataframe):
    profile = profile_dataframe(messy_dataframe, dataset_id="test_ds_duplicates")

    # Row 0 and Row 1 are exact duplicates, so duplicated().sum() should be exactly 1
    assert profile.duplicate_row_count == 1


def test_profile_dataframe_column_types(messy_dataframe):
    profile = profile_dataframe(messy_dataframe, dataset_id="test_ds_types")
    type_map = {col.name: col.type for col in profile.columns}

    assert type_map["user_id"] == "numerical"
    assert type_map["age"] == "numerical"
    assert type_map["name"] == "categorical"
    assert type_map["category"] == "categorical"
    assert type_map["signup_date"] == "date"
    assert type_map["is_verified"] == "boolean"

    # Verify type_summary counts
    assert profile.type_summary["numerical"] == 2
    assert profile.type_summary["categorical"] == 2
    assert profile.type_summary["date"] == 1
    assert profile.type_summary["boolean"] == 1


def test_profile_dataframe_missing_values(messy_dataframe):
    profile = profile_dataframe(messy_dataframe, dataset_id="test_ds_missing")
    missing_map = {col.name: (col.missing_count, col.missing_percentage) for col in profile.columns}

    # user_id: 0 missing
    assert missing_map["user_id"][0] == 0
    assert missing_map["user_id"][1] == 0.0

    # name: 1 missing out of 7 -> ~14.29%
    assert missing_map["name"][0] == 1
    assert missing_map["name"][1] == pytest.approx(14.29, abs=0.01)

    # age: 2 missing out of 7 -> ~28.57%
    assert missing_map["age"][0] == 2
    assert missing_map["age"][1] == pytest.approx(28.57, abs=0.01)

    # signup_date: 2 missing out of 7 -> ~28.57%
    assert missing_map["signup_date"][0] == 2
    assert missing_map["signup_date"][1] == pytest.approx(28.57, abs=0.01)

    # is_verified: 1 missing out of 7 -> ~14.29%
    assert missing_map["is_verified"][0] == 1
    assert missing_map["is_verified"][1] == pytest.approx(14.29, abs=0.01)


def test_profile_dataframe_memory_usage(messy_dataframe):
    profile = profile_dataframe(messy_dataframe, dataset_id="test_ds_memory")

    assert profile.memory_usage_bytes > 0
    assert isinstance(profile.memory_usage_formatted, str)
    assert any(unit in profile.memory_usage_formatted for unit in ["B", "KB", "MB"])


def test_classify_column_type_isolated():
    # Numerical
    assert classify_column_type(pd.Series([1, 2, 3])) == "numerical"
    assert classify_column_type(pd.Series([1.5, np.nan, 3.2])) == "numerical"

    # Boolean
    assert classify_column_type(pd.Series([True, False, True])) == "boolean"
    assert classify_column_type(pd.Series([True, None, False], dtype="boolean")) == "boolean"

    # Date
    assert classify_column_type(pd.Series(pd.date_range("2023-01-01", periods=3))) == "date"
    assert classify_column_type(pd.Series(["2023-01-01", "2023-01-02", None])) == "date"

    # Categorical
    assert classify_column_type(pd.Series(["apple", "banana", "cherry"])) == "categorical"
    assert classify_column_type(pd.Series(["A", "B", "A"], dtype="category")) == "categorical"


def test_profile_empty_dataframe():
    empty_df = pd.DataFrame()
    profile = profile_dataframe(empty_df, dataset_id="test_empty")

    assert profile.row_count == 0
    assert profile.column_count == 0
    assert profile.duplicate_row_count == 0
    assert profile.memory_usage_bytes == 0
    assert len(profile.columns) == 0


def test_profile_all_null_column():
    all_null_df = pd.DataFrame({"empty_col": [None, np.nan, None]})
    profile = profile_dataframe(all_null_df, dataset_id="test_all_null")

    assert profile.row_count == 3
    col_prof = profile.columns[0]
    assert col_prof.name == "empty_col"
    assert col_prof.missing_count == 3
    assert col_prof.missing_percentage == 100.0


def test_format_bytes():
    assert format_bytes(500) == "500 B"
    assert format_bytes(2048) == "2.00 KB"
    assert format_bytes(1048576 * 3) == "3.00 MB"
    assert format_bytes(-10) == "0 B"
