CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY, project_id TEXT, directory TEXT, title TEXT,
  time_created INTEGER, time_updated INTEGER
);
CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER,
  time_updated INTEGER, data TEXT
);
INSERT INTO session VALUES ('ses-001', 'proj-001', '/Users/dev/my-project', 'Fix auth bug', 1712991600000, 1712991660000);
INSERT INTO message VALUES ('msg-001', 'ses-001', 1712991600000, 1712991610000, '{"role":"user","time":{"created":1712991600000},"model":{"providerID":"openrouter","modelID":"google/gemini-3.1-pro-preview"}}');
INSERT INTO message VALUES ('msg-002', 'ses-001', 1712991610000, 1712991620000, '{"role":"assistant","time":{"created":1712991610000,"completed":1712991620000},"modelID":"google/gemini-3.1-pro-preview","providerID":"openrouter","cost":0.045,"tokens":{"total":11778,"input":10791,"output":987,"reasoning":0,"cache":{"read":5000,"write":200}}}');
INSERT INTO message VALUES ('msg-003', 'ses-001', 1712991630000, 1712991640000, '{"role":"assistant","time":{"created":1712991630000,"completed":1712991640000},"modelID":"google/gemini-3.1-pro-preview","providerID":"openrouter","cost":0.012,"tokens":{"total":3500,"input":3000,"output":500,"reasoning":100,"cache":{"read":1000,"write":0}}}');
