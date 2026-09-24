import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Any, List
import pandas as pd

from app.services.replay import ReplayEngine

logger = logging.getLogger(__name__)

DEFAULT_TTL_SECONDS = 24 * 60 * 60  # 24 hours in seconds


class OperationRecord:
    """Lightweight metadata record of a single cleaning operation applied to a dataset."""

    def __init__(
        self,
        operation: str,
        params: dict,
        columns_affected: list,
        affected_row_count: int,
        rows_before: int,
        rows_after: int,
        snapshot_before: Optional[pd.DataFrame] = None,
    ):
        self.operation = operation
        self.params = params
        self.columns_affected = columns_affected
        self.affected_row_count = affected_row_count
        self.rows_before = rows_before
        self.rows_after = rows_after
        # snapshot_before is kept optional for backward compatibility
        self.applied_at = datetime.now(timezone.utc).isoformat()


class DatasetSession:
    def __init__(self, dataset_id: str, df: pd.DataFrame, metadata: Optional[Dict[str, Any]] = None):
        self.dataset_id = dataset_id
        # Untouched original dataframe snapshot upon initial upload
        self.original_df = df.copy(deep=True) if df is not None else pd.DataFrame()
        # Current active state dataframe
        self.df = df.copy(deep=True) if df is not None else pd.DataFrame()
        self.metadata = metadata or {}
        now = datetime.now(timezone.utc)
        self.created_at = now
        self.last_accessed_at = now
        self.history: List[OperationRecord] = []
        self.current_step: int = 0  # Pointer in history stack (0 to len(history))

    def touch(self) -> None:
        self.last_accessed_at = datetime.now(timezone.utc)

    def is_expired(self, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> bool:
        elapsed = (datetime.now(timezone.utc) - self.last_accessed_at).total_seconds()
        return elapsed > ttl_seconds

    def push_operation(self, record: OperationRecord) -> int:
        """
        Pushes a new operation record. If current_step < len(history),
        truncates any undone redo operations before appending.
        """
        if self.current_step < len(self.history):
            self.history = self.history[: self.current_step]

        self.history.append(record)
        self.current_step = len(self.history)
        return self.current_step - 1

    def replay_to_step(self, target_step: int) -> pd.DataFrame:
        """
        Replays operations starting from original_df up to target_step (0 to len(history)).
        Updates self.df and self.current_step.
        """
        target_step = max(0, min(target_step, len(self.history)))
        current_df = self.original_df.copy(deep=True)

        for i in range(target_step):
            rec = self.history[i]
            current_df = ReplayEngine.apply_record(current_df, rec.operation, rec.params)

        self.df = current_df
        self.current_step = target_step
        self.touch()
        return self.df

    def undo(self) -> Optional[OperationRecord]:
        """Undoes 1 step using log replay."""
        if self.current_step <= 0:
            return None
        undone_record = self.history[self.current_step - 1]
        self.replay_to_step(self.current_step - 1)
        return undone_record

    def redo(self) -> Optional[OperationRecord]:
        """Redoes 1 step using log replay."""
        if self.current_step >= len(self.history):
            return None
        redone_record = self.history[self.current_step]
        self.replay_to_step(self.current_step + 1)
        return redone_record

    def pop_operation(self) -> Optional[OperationRecord]:
        """Backward compatibility helper for rollback: undoes the last operation."""
        return self.undo()


class SessionStore:
    """
    In-memory session store holding a pandas DataFrame per dataset_id.
    Includes TTL-based cleanup to expire sessions after 24h of inactivity.
    """

    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS):
        self._sessions: Dict[str, DatasetSession] = {}
        self.ttl_seconds = ttl_seconds
        self._cleanup_task: Optional[asyncio.Task] = None

    def get(self, dataset_id: str) -> Optional[pd.DataFrame]:
        """
        Retrieves DataFrame for dataset_id, touching its last_accessed_at.
        Returns None if not found or expired.
        """
        session = self._sessions.get(dataset_id)
        if not session:
            return None

        if session.is_expired(self.ttl_seconds):
            self.delete(dataset_id)
            return None

        session.touch()
        return session.df

    def get_session(self, dataset_id: str) -> Optional[DatasetSession]:
        """
        Retrieves full DatasetSession wrapper (with metadata and timestamps).
        """
        session = self._sessions.get(dataset_id)
        if not session:
            return None

        if session.is_expired(self.ttl_seconds):
            self.delete(dataset_id)
            return None

        session.touch()
        return session

    def set(
        self,
        dataset_id: str,
        df: pd.DataFrame,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> DatasetSession:
        """
        Stores or replaces the DataFrame for the given dataset_id.
        """
        session = DatasetSession(dataset_id, df, metadata)
        self._sessions[dataset_id] = session
        return session

    def update_dataframe(self, dataset_id: str, df: pd.DataFrame) -> bool:
        """
        Updates the DataFrame in-place for an existing session.
        """
        session = self._sessions.get(dataset_id)
        if not session or session.is_expired(self.ttl_seconds):
            return False
        session.df = df
        session.touch()
        return True

    def delete(self, dataset_id: str) -> bool:
        """
        Deletes a session by dataset_id.
        """
        if dataset_id in self._sessions:
            del self._sessions[dataset_id]
            return True
        return False

    def list_active_dataset_ids(self) -> list[str]:
        self.cleanup_expired()
        return list(self._sessions.keys())

    def cleanup_expired(self) -> int:
        """
        Removes all sessions that have exceeded the TTL without activity.
        Returns number of expired sessions removed.
        """
        expired_keys = [
            k for k, v in self._sessions.items()
            if v.is_expired(self.ttl_seconds)
        ]
        for k in expired_keys:
            del self._sessions[k]
        if expired_keys:
            logger.info(f"Cleaned up {len(expired_keys)} expired dataset sessions.")
        return len(expired_keys)

    async def start_periodic_cleanup(self, interval_seconds: int = 3600):
        """
        Runs periodic background task to clean up expired sessions.
        """
        while True:
            try:
                await asyncio.sleep(interval_seconds)
                self.cleanup_expired()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error during session store cleanup: {e}")


# Singleton instance shared across the application
session_store = SessionStore()
