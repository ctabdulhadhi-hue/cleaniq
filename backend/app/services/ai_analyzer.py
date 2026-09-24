import os
import json
import hashlib
import logging
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

from app.models.dataset import AIRecommendationItem, AIAnalysisResponse
from app.services.profiler import profile_dataframe, classify_column_type
from app.services.quality import QualityScoreService
from app.services.type_detector import TypeDetectorService
from app.services.text_cleaner import TextCleanerService
from app.services.outliers import OutlierDetectorService

logger = logging.getLogger(__name__)

# Global in-memory cache for AI analysis results per dataset + profile-hash
_ai_analysis_cache: Dict[str, AIAnalysisResponse] = {}


class AIAnalysisService:
    """
    AI Analysis Service for datasets.
    Strict Privacy Rule: NEVER sends raw row-level data.
    Only passes dataset metadata profiles (shape, dtypes, missing %, flagged issues, quality sub-scores).
    Caches responses per dataset+profile-hash.
    """

    @classmethod
    def clear_cache(cls) -> None:
        """Clears the in-memory analysis cache."""
        _ai_analysis_cache.clear()

    @classmethod
    def build_profile_metadata(cls, df: pd.DataFrame, dataset_id: str) -> Dict[str, Any]:
        """
        Extracts high-level statistical metadata profile from DataFrame.
        Guaranteed zero row-level raw data.
        """
        profile = profile_dataframe(df, dataset_id)
        quality = QualityScoreService.compute(df)
        
        column_summaries = []
        for col_prof in profile.columns:
            column_summaries.append({
                "column": col_prof.name,
                "type": col_prof.type,
                "missing_count": col_prof.missing_count,
                "missing_percentage": round(col_prof.missing_percentage, 2),
                "unique_count": col_prof.unique_count,
            })

        # Type conversion suggestions
        type_suggestions = []
        try:
            sug_list = TypeDetectorService.suggest_types(df)
            for sug in sug_list:
                if sug.get("confidence", 0) > 0.6:
                    type_suggestions.append({
                        "column": sug["column"],
                        "current_type": sug["current_type"],
                        "suggested_type": sug["suggested_type"],
                        "confidence": sug["confidence"],
                        "sample_reason": sug["sample_reason"],
                    })
        except Exception as e:
            logger.warning(f"Error computing type suggestions for metadata: {e}")

        # Outlier counts per numeric column
        outlier_summary = []
        for col in df.columns:
            if classify_column_type(df[col]) == "numerical":
                try:
                    res = OutlierDetectorService.detect(df[col], method="iqr", multiplier=1.5)
                    if res["outlier_count"] > 0:
                        outlier_summary.append({
                            "column": col,
                            "outlier_count": res["outlier_count"],
                            "percentage": round(res["percentage"], 2),
                        })
                except Exception:
                    pass

        # Text standardization candidates
        standardize_summary = []
        for col in df.columns:
            if classify_column_type(df[col]) == "categorical":
                try:
                    clusters = TextCleanerService.cluster_near_duplicates(df[col], similarity_threshold=0.85, max_clusters=10)
                    if clusters:
                        standardize_summary.append({
                            "column": col,
                            "cluster_count": len(clusters),
                            "affected_values": sum(c["total_affected"] for c in clusters),
                        })
                except Exception:
                    pass

        metadata = {
            "dataset_id": dataset_id,
            "shape": [profile.row_count, profile.column_count],
            "total_rows": profile.row_count,
            "total_columns": profile.column_count,
            "duplicate_rows": profile.duplicate_row_count,
            "duplicate_percentage": round((profile.duplicate_row_count / profile.row_count * 100) if profile.row_count > 0 else 0.0, 2),
            "quality_score": {
                "overall": round(quality["overall_score"], 4),
                "sub_scores": {s["name"]: round(s["score"], 4) for s in quality["sub_scores"]},
            },
            "columns": column_summaries,
            "type_suggestions": type_suggestions,
            "outliers_flagged": outlier_summary,
            "text_clusters_flagged": standardize_summary,
        }

        return metadata

    @classmethod
    def compute_profile_hash(cls, metadata: Dict[str, Any]) -> str:
        """Computes a SHA-256 hash of the dataset metadata profile dictionary."""
        # Standardize representation by removing dynamic IDs if present
        meta_copy = dict(metadata)
        meta_copy.pop("dataset_id", None)
        serialized = json.dumps(meta_copy, sort_keys=True)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @classmethod
    def generate_fallback_recommendations(
        cls, metadata: Dict[str, Any], df: pd.DataFrame
    ) -> List[AIRecommendationItem]:
        """
        Rule-based generator producing formatted AI recommendations when Gemini API is unavailable.
        """
        recs: List[AIRecommendationItem] = []
        item_id = 1

        # 1. Missing values
        for col_info in metadata["columns"]:
            col = col_info["column"]
            missing_cnt = col_info["missing_count"]
            missing_pct = col_info["missing_percentage"]
            col_type = col_info["type"]

            if missing_cnt > 0:
                if col_type == "numerical":
                    recs.append(
                        AIRecommendationItem(
                            id=item_id,
                            issue=f"Column '{col}' has {missing_cnt} missing values ({missing_pct}% of column).",
                            recommendation=f"Impute missing values in '{col}' using the column median.",
                            reason="median is less sensitive to outliers than mean",
                            target_column=col,
                            action_type="clean_missing",
                            action_params={"strategy": "median", "columns": [col]},
                        )
                    )
                else:
                    recs.append(
                        AIRecommendationItem(
                            id=item_id,
                            issue=f"Column '{col}' has {missing_cnt} missing values ({missing_pct}% of column).",
                            recommendation=f"Impute missing values in '{col}' using the most frequent value (mode).",
                            reason="mode preserves the dominant categorical frequency without introducing unknown categories",
                            target_column=col,
                            action_type="clean_missing",
                            action_params={"strategy": "mode", "columns": [col]},
                        )
                    )
                item_id += 1

        # 2. Duplicate rows
        dup_rows = metadata["duplicate_rows"]
        dup_pct = metadata["duplicate_percentage"]
        if dup_rows > 0:
            recs.append(
                AIRecommendationItem(
                    id=item_id,
                    issue=f"Dataset contains {dup_rows} exact duplicate rows ({dup_pct}% of total dataset).",
                    recommendation="Remove duplicate rows, retaining the first occurrence of each record.",
                    reason="duplicate rows distort sample counts and artificially skew analytical metrics",
                    target_column=None,
                    action_type="clean_duplicates",
                    action_params={"keep": "first"},
                )
            )
            item_id += 1

        # 3. Data type conversions
        for ts in metadata.get("type_suggestions", []):
            col = ts["column"]
            curr_type = ts["current_type"]
            sug_type = ts["suggested_type"]
            recs.append(
                AIRecommendationItem(
                    id=item_id,
                    issue=f"Column '{col}' is stored as '{curr_type}', but its content matches '{sug_type}'.",
                    recommendation=f"Convert column '{col}' data type from '{curr_type}' to '{sug_type}'.",
                    reason=f"converting to {sug_type} optimizes memory storage and enables proper domain-specific operations",
                    target_column=col,
                    action_type="convert_type",
                    action_params={"column": col, "target_type": sug_type},
                )
            )
            item_id += 1

        # 4. Outliers
        for out in metadata.get("outliers_flagged", []):
            col = out["column"]
            cnt = out["outlier_count"]
            pct = out["percentage"]
            recs.append(
                AIRecommendationItem(
                    id=item_id,
                    issue=f"Column '{col}' contains {cnt} statistical outliers ({pct}% of column).",
                    recommendation=f"Cap extreme outliers in '{col}' at IQR 1.5 upper and lower boundaries.",
                    reason="capping preserves row observations while neutralizing distorting extreme values",
                    target_column=col,
                    action_type="outlier_handle",
                    action_params={"column": col, "method": "iqr", "action": "cap", "multiplier": 1.5},
                )
            )
            item_id += 1

        # 5. Near-duplicate text standardization
        for text_flag in metadata.get("text_clusters_flagged", []):
            col = text_flag["column"]
            affected = text_flag["affected_values"]
            recs.append(
                AIRecommendationItem(
                    id=item_id,
                    issue=f"Column '{col}' has {affected} entries with minor spelling or capitalization inconsistencies.",
                    recommendation=f"Standardize near-duplicate category values in '{col}'.",
                    reason="unifying inconsistent category representations prevents fragmented grouping in charts and queries",
                    target_column=col,
                    action_type="standardize_values",
                    action_params={"column": col},
                )
            )
            item_id += 1

        if not recs:
            recs.append(
                AIRecommendationItem(
                    id=1,
                    issue="No major data quality anomalies detected.",
                    recommendation="The dataset profile meets high cleanliness standard across missingness, types, and uniqueness.",
                    reason="all quality sub-scores (completeness, consistency, validity, uniqueness) are optimal",
                    target_column=None,
                    action_type="none",
                    action_params={},
                )
            )

        return recs

    @classmethod
    def analyze_with_gemini(
        cls, metadata: Dict[str, Any], api_key: str
    ) -> Optional[List[AIRecommendationItem]]:
        """
        Sends ONLY dataset profile metadata to Gemini API via google-genai SDK.
        Returns parsed list of AIRecommendationItem or None if call fails.
        """
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)

            prompt = f"""
You are an expert automated data quality analyst.
Analyze the following dataset statistical metadata profile.

DATASET METADATA PROFILE (NO ROW DATA):
{json.dumps(metadata, indent=2)}

REQUIREMENTS:
1. Output a JSON object containing a top-level list key 'recommendations'.
2. Each recommendation in the array must be an object with:
   - "id": integer starting at 1
   - "issue": short string describing the issue in the profile
   - "recommendation": explicit, actionable cleaning suggestion
   - "reason": concise explanation why (e.g. "median is less sensitive to outliers than mean")
   - "target_column": name of affected column or null
   - "action_type": string, one of ["clean_missing", "clean_duplicates", "outlier_handle", "convert_type", "standardize_values", "text_transform", "none"]
   - "action_params": object containing pre-filled parameters for the action:
       - for "clean_missing": {{"strategy": "median"|"mean"|"mode"|"drop_row"|"drop_col", "columns": ["col_name"]}}
       - for "clean_duplicates": {{"keep": "first"}}
       - for "outlier_handle": {{"column": "col_name", "method": "iqr"|"zscore", "action": "cap"|"remove"|"keep", "multiplier": 1.5}}
       - for "convert_type": {{"column": "col_name", "target_type": "integer"|"float"|"string"|"date"|"boolean"}}
       - for "standardize_values": {{"column": "col_name"}}

STRICT PRIVACY GUARANTEE: Never ask for or attempt to analyze raw row-level dataset entries. Respond strictly in JSON format.
"""

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )

            raw_text = response.text
            if not raw_text:
                return None

            data = json.loads(raw_text)
            recs_json = data.get("recommendations", [])
            
            recommendations: List[AIRecommendationItem] = []
            for i, item in enumerate(recs_json, 1):
                rec_item = AIRecommendationItem(
                    id=item.get("id", i),
                    issue=item.get("issue", ""),
                    recommendation=item.get("recommendation", ""),
                    reason=item.get("reason", ""),
                    target_column=item.get("target_column"),
                    action_type=item.get("action_type", "none"),
                    action_params=item.get("action_params", {}),
                )
                recommendations.append(rec_item)

            return recommendations
        except Exception as e:
            logger.warning(f"Gemini API invocation failed/errored: {e}. Falling back to rule-based engine.")
            return None

    @classmethod
    def analyze(cls, df: pd.DataFrame, dataset_id: str) -> AIAnalysisResponse:
        """
        Main entry point for dataset AI analysis.
        Calculates profile hash and checks cache.
        Calls Gemini API if GEMINI_API_KEY is available, else falls back to rule generator.
        """
        metadata = cls.build_profile_metadata(df, dataset_id)
        profile_hash = cls.compute_profile_hash(metadata)

        cache_key = f"{dataset_id}:{profile_hash}"
        if cache_key in _ai_analysis_cache:
            cached_resp = _ai_analysis_cache[cache_key]
            return AIAnalysisResponse(
                dataset_id=dataset_id,
                profile_hash=profile_hash,
                cached=True,
                source=cached_resp.source,
                recommendations=cached_resp.recommendations,
            )

        api_key = os.environ.get("GEMINI_API_KEY")
        source = "fallback_rules"
        recommendations = None

        if api_key:
            recommendations = cls.analyze_with_gemini(metadata, api_key)
            if recommendations:
                source = "gemini"

        if not recommendations:
            recommendations = cls.generate_fallback_recommendations(metadata, df)
            source = "fallback_rules"

        response = AIAnalysisResponse(
            dataset_id=dataset_id,
            profile_hash=profile_hash,
            cached=False,
            source=source,
            recommendations=recommendations,
        )

        _ai_analysis_cache[cache_key] = response
        return response
