import re
import difflib
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
from app.core.errors import AppError


class TextCleanerService:
    """
    Provides text cleaning primitives and category value clustering for standardization.
    """

    @staticmethod
    def transform_text(
        series: pd.Series,
        operation: str,
        case_type: Optional[str] = None,
        find_text: Optional[str] = None,
        replace_text: Optional[str] = None,
        regex: bool = False,
    ) -> Tuple[pd.Series, int]:
        """
        Applies a text cleaning operation to a pandas Series.
        Returns the transformed Series and count of affected rows.
        """
        original = series.copy()
        str_series = series.astype(str)
        # Keep track of original nulls so we don't convert them to string 'nan'
        null_mask = series.isna()

        if operation == "trim":
            # Strip outer whitespace and collapse multiple inner spaces
            transformed = str_series.apply(
                lambda s: re.sub(r"\s+", " ", s.strip()) if pd.notna(s) else s
            )

        elif operation == "case":
            if case_type == "lower":
                transformed = str_series.apply(lambda s: s.lower() if pd.notna(s) else s)
            elif case_type == "upper":
                transformed = str_series.apply(lambda s: s.upper() if pd.notna(s) else s)
            elif case_type == "title":
                transformed = str_series.apply(lambda s: s.title() if pd.notna(s) else s)
            else:
                raise AppError(
                    code="INVALID_CASE_TYPE",
                    message="Case type must be 'lower', 'upper', or 'title'.",
                    status_code=400,
                )

        elif operation == "remove_special":
            # Remove characters that are not alphanumeric or whitespace
            transformed = str_series.apply(
                lambda s: re.sub(r"[^a-zA-Z0-9\s]", "", s) if pd.notna(s) else s
            )

        elif operation == "find_replace":
            if find_text is None:
                raise AppError(
                    code="MISSING_PARAM",
                    message="Find & Replace requires 'find_text'.",
                    status_code=400,
                )
            rep = replace_text or ""
            if regex:
                transformed = str_series.apply(
                    lambda s: re.sub(find_text, rep, s) if pd.notna(s) else s
                )
            else:
                transformed = str_series.apply(
                    lambda s: s.replace(find_text, rep) if pd.notna(s) else s
                )

        else:
            raise AppError(
                code="INVALID_OPERATION",
                message=f"Unknown text operation '{operation}'. Use: trim, case, remove_special, find_replace.",
                status_code=400,
            )

        # Restore original nulls
        transformed[null_mask] = None

        # Count differences
        affected_mask = (original.astype(str) != transformed.astype(str)) & (~null_mask)
        affected_count = int(affected_mask.sum())

        return transformed, affected_count

    @staticmethod
    def cluster_near_duplicates(
        series: pd.Series,
        similarity_threshold: float = 0.85,
        max_clusters: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Clusters near-duplicate strings in a column (e.g. 'Sales', 'sales', ' SALES ').
        Groups by exact normalized signature, then by fuzzy similarity.
        Returns proposed merge clusters for user confirmation.
        """
        non_null_series = series.dropna()
        if non_null_series.empty:
            return []

        # Value frequencies
        counts = non_null_series.astype(str).value_counts().to_dict()
        unique_vals = list(counts.keys())

        if len(unique_vals) <= 1:
            return []

        # 1. First pass: exact normalized clusters (strip + lower)
        norm_groups: Dict[str, List[str]] = {}
        for val in unique_vals:
            norm_key = re.sub(r"\s+", " ", val.strip()).casefold()
            norm_groups.setdefault(norm_key, []).append(val)

        # 2. Second pass: merge clusters that have high fuzzy similarity
        merged_clusters: List[List[str]] = []
        visited = set()

        keys = list(norm_groups.keys())
        for i, k1 in enumerate(keys):
            if k1 in visited:
                continue
            current_cluster = list(norm_groups[k1])
            visited.add(k1)

            # Compare against remaining keys if threshold < 1.0
            if similarity_threshold < 1.0:
                for k2 in keys[i + 1 :]:
                    if k2 in visited:
                        continue
                    # Compare similarity between the normalized keys
                    ratio = difflib.SequenceMatcher(None, k1, k2).ratio()
                    if ratio >= similarity_threshold:
                        current_cluster.extend(norm_groups[k2])
                        visited.add(k2)

            # Only consider clusters that actually have more than 1 distinct variant
            if len(current_cluster) > 1:
                merged_clusters.append(current_cluster)

        # 3. Format clusters with canonical pick & variant details
        result = []
        for cluster in merged_clusters[:max_clusters]:
            # Pick canonical: the variant with highest count in dataset
            sorted_variants = sorted(
                cluster,
                key=lambda v: (counts.get(v, 0), -len(v)),
                reverse=True,
            )
            canonical = sorted_variants[0]
            other_variants = sorted_variants[1:]

            total_affected = sum(counts.get(v, 0) for v in other_variants)

            result.append({
                "canonical": canonical,
                "canonical_count": counts.get(canonical, 0),
                "variants": [{"value": v, "count": counts.get(v, 0)} for v in other_variants],
                "total_affected": total_affected,
            })

        # Sort by most impactful clusters first
        result.sort(key=lambda c: c["total_affected"], reverse=True)
        return result

    @staticmethod
    def apply_standardize(
        series: pd.Series,
        merges: List[Dict[str, Any]],
    ) -> Tuple[pd.Series, int]:
        """
        Applies user-approved cluster merges to a column.
        merges: list of { 'canonical': str, 'variants': list of str }
        """
        mapping: Dict[str, str] = {}
        for merge in merges:
            canonical = merge.get("canonical")
            variants = merge.get("variants", [])
            for v in variants:
                mapping[v] = canonical

        if not mapping:
            return series.copy(), 0

        original = series.copy()
        transformed = series.map(lambda x: mapping.get(x, x) if pd.notna(x) else x)

        affected = int(((original != transformed) & series.notna()).sum())
        return transformed, affected
