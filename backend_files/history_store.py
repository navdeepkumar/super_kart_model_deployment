"""
Lightweight persistence for prediction history.

Every successful call to /v1/predict or /v1/predictbatch is recorded here
along with the input that produced it, so a user can come back later and
see what was asked and what came back. SQLite through the standard library
is the right tool for this: a single file next to the model artifact, no
separate database service to install, run, or configure, which matches the
scale of this API, a handful of requests a minute at most, not a high
concurrency production system. WAL mode is turned on so the gunicorn
worker processes that share this file do not block each other on ordinary
reads and writes.

Note for container deployments: this file lives inside the container's
filesystem by default, so history does not survive a container being
recreated unless a volume is mounted at the backend's working directory.
That trade-off is intentional here, favoring a zero-configuration default
over durability that this project does not need.
"""

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    summary TEXT NOT NULL,
    input_json TEXT NOT NULL,
    result_json TEXT NOT NULL
);
"""


@contextmanager
def _connect():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.execute("PRAGMA journal_mode=WAL;")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db():
    """Creates the predictions table on first run, a no-op after that.

    Guarded with a short retry loop. gunicorn's --preload avoids the
    original cause of a locked database here, both workers no longer call
    this at the same instant, but the retry stays cheap insurance for any
    other multi-process launcher that skips preloading.
    """
    last_error = None
    for attempt in range(5):
        try:
            with _connect() as conn:
                conn.execute(_SCHEMA)
            return
        except sqlite3.OperationalError as exc:
            last_error = exc
            time.sleep(0.2 * (attempt + 1))
    raise last_error


def record_prediction(mode, summary, input_data, result_data):
    """Stores one prediction request alongside its result.

    mode is "single" or "batch". input_data and result_data are plain
    Python values (dict or list), serialized to JSON text for storage and
    parsed back into Python objects on read.
    """
    with _connect() as conn:
        conn.execute(
            "INSERT INTO predictions (mode, created_at, summary, input_json, result_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                mode,
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                summary,
                json.dumps(input_data),
                json.dumps(result_data),
            ),
        )


def fetch_history(limit=50):
    """Returns the most recently recorded predictions, newest first."""
    limit = max(1, min(int(limit), 200))
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, mode, created_at, summary, input_json, result_json "
            "FROM predictions ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "mode": row["mode"],
            "createdAt": row["created_at"],
            "summary": row["summary"],
            "input": json.loads(row["input_json"]),
            "result": json.loads(row["result_json"]),
        }
        for row in rows
    ]


def clear_history():
    """Deletes every stored prediction. Backs the UI's Clear history action."""
    with _connect() as conn:
        conn.execute("DELETE FROM predictions")
