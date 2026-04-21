CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  tool            TEXT NOT NULL,
  model           TEXT NOT NULL,
  cwd             TEXT,
  git_repo        TEXT,
  git_branch      TEXT,
  git_commit_start TEXT,
  git_commit_end  TEXT,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  cache_read      INTEGER DEFAULT 0,
  cache_write     INTEGER DEFAULT 0,
  cost_millicents INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(git_repo, started_at);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  turn_index      INTEGER NOT NULL,
  role            TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  content_redacted TEXT,
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  cache_read      INTEGER DEFAULT 0,
  cache_write     INTEGER DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_messages_hash ON messages(content_hash);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content_redacted,
  content='messages',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content_redacted) VALUES (new.id, new.content_redacted);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_redacted) VALUES('delete', old.id, old.content_redacted);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_redacted) VALUES('delete', old.id, old.content_redacted);
  INSERT INTO messages_fts(rowid, content_redacted) VALUES (new.id, new.content_redacted);
END;

CREATE TABLE IF NOT EXISTS tool_calls (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id      INTEGER NOT NULL REFERENCES messages(id),
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  tool_name       TEXT NOT NULL,
  args_hash       TEXT NOT NULL,
  args_json       TEXT,
  target_path     TEXT,
  succeeded       INTEGER,
  tokens_returned INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session_args ON tool_calls(session_id, tool_name, args_hash);
CREATE INDEX IF NOT EXISTS idx_tool_calls_path ON tool_calls(target_path);

CREATE TABLE IF NOT EXISTS hook_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT,
  hook_kind       TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  decision        TEXT,
  reason          TEXT,
  latency_ms      INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hook_events_session ON hook_events(session_id, created_at);

CREATE TABLE IF NOT EXISTS git_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  repo            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  sha             TEXT,
  pr_number       INTEGER,
  branch          TEXT,
  title           TEXT,
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_git_events_dedup ON git_events(repo, kind, COALESCE(sha,''), COALESCE(pr_number,0));

CREATE TABLE IF NOT EXISTS detections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT,
  rule_id         TEXT NOT NULL,
  severity        TEXT NOT NULL,
  summary         TEXT NOT NULL,
  metadata_json   TEXT,
  suggested_action_json TEXT,
  acknowledged_at INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_detections_rule ON detections(rule_id, created_at);
CREATE INDEX IF NOT EXISTS idx_detections_session ON detections(session_id);

CREATE TABLE IF NOT EXISTS redaction_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern         TEXT NOT NULL,
  replacement     TEXT NOT NULL DEFAULT '[REDACTED]',
  enabled         INTEGER NOT NULL DEFAULT 1,
  builtin         INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key             TEXT PRIMARY KEY,
  enabled         INTEGER NOT NULL DEFAULT 0,
  config_json     TEXT
);

CREATE TABLE IF NOT EXISTS commit_attributions (
  commit_sha      TEXT NOT NULL,
  repo            TEXT NOT NULL,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  branch          TEXT,
  subject         TEXT,
  committed_at    INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (commit_sha, repo, session_id)
);
CREATE INDEX IF NOT EXISTS idx_commit_attr_repo ON commit_attributions(repo, committed_at);
CREATE INDEX IF NOT EXISTS idx_commit_attr_session ON commit_attributions(session_id);

CREATE TABLE IF NOT EXISTS pr_attributions (
  pr_number       INTEGER NOT NULL,
  repo            TEXT NOT NULL,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  overlap_kind    TEXT NOT NULL,
  confidence      REAL NOT NULL,
  PRIMARY KEY (pr_number, repo, session_id)
);

CREATE TABLE IF NOT EXISTS batch_runs (
  job_name        TEXT PRIMARY KEY,
  last_run_at     INTEGER NOT NULL,
  last_status     TEXT NOT NULL
);
