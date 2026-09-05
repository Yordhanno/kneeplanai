PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS researchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kneeplan_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('validator', 'tester', 'both')),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'suspended')),
  device_token_hash TEXT,
  device_registered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_researchers_status ON researchers(status);

CREATE TABLE IF NOT EXISTS researcher_auth_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  researcher_id INTEGER NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  provider TEXT NOT NULL DEFAULT '',
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (researcher_id) REFERENCES researchers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_researcher_auth_emails_researcher
  ON researcher_auth_emails(researcher_id);

INSERT OR IGNORE INTO researcher_auth_emails (researcher_id, email, provider, is_primary)
SELECT id, email, 'primary', 1 FROM researchers;

CREATE TABLE IF NOT EXISTS apple_oidc_states (
  state_hash TEXT PRIMARY KEY,
  upstream_state TEXT NOT NULL,
  upstream_redirect_uri TEXT NOT NULL,
  upstream_nonce TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apple_oidc_states_expires ON apple_oidc_states(expires_at);

CREATE TABLE IF NOT EXISTS validation_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  researcher_id INTEGER NOT NULL,
  case_code TEXT NOT NULL,
  app_version TEXT NOT NULL DEFAULT '',
  image_quality TEXT NOT NULL DEFAULT '' CHECK (image_quality IN ('', 'adequate', 'limited', 'poor')),
  analysis_duration_seconds INTEGER,
  hka_reference REAL,
  hka_kneeplan REAL,
  mldfa_reference REAL,
  mldfa_kneeplan REAL,
  mpta_reference REAL,
  mpta_kneeplan REAL,
  jlca_reference REAL,
  jlca_kneeplan REAL,
  aldfa_reference REAL,
  aldfa_kneeplan REAL,
  ama_reference REAL,
  ama_kneeplan REAL,
  afta_reference REAL,
  afta_kneeplan REAL,
  ahka_reference REAL,
  ahka_kneeplan REAL,
  jlo_reference REAL,
  jlo_kneeplan REAL,
  cpak_reference TEXT NOT NULL DEFAULT '',
  cpak_kneeplan TEXT NOT NULL DEFAULT '',
  comments TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (researcher_id) REFERENCES researchers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_validation_researcher ON validation_results(researcher_id);
CREATE INDEX IF NOT EXISTS idx_validation_case ON validation_results(case_code);
CREATE INDEX IF NOT EXISTS idx_validation_created ON validation_results(created_at);

CREATE TABLE IF NOT EXISTS research_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  researcher_id INTEGER NOT NULL,
  case_code TEXT NOT NULL,
  center_code TEXT NOT NULL DEFAULT '',
  side TEXT NOT NULL CHECK (side IN ('derecha', 'izquierda')),
  mode TEXT NOT NULL CHECK (mode IN ('manual_cegado', 'validacion_externa', 'desarrollo_oai')),
  method TEXT NOT NULL CHECK (method IN ('manual_web', 'autodeteccion_web', 'manual_corregido_web')),
  session TEXT NOT NULL CHECK (session IN ('inicial', 'repeticion_4_semanas')),
  image_quality TEXT NOT NULL DEFAULT '' CHECK (image_quality IN ('', 'adequate', 'limited', 'poor')),
  app_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  image_sha256 TEXT NOT NULL,
  filename_sha256 TEXT NOT NULL DEFAULT '',
  hka_internal REAL,
  hka_signed REAL,
  mldfa REAL,
  mpta REAL,
  jlca REAL,
  jlca_signed REAL,
  aldfa REAL,
  ama REAL,
  afta REAL,
  ahka REAL,
  jlo REAL,
  cpak TEXT,
  manual_seconds REAL,
  review_confirmed INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (researcher_id, case_code, side, session, method),
  FOREIGN KEY (researcher_id) REFERENCES researchers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_runs_researcher ON research_runs(researcher_id);
CREATE INDEX IF NOT EXISTS idx_runs_case ON research_runs(case_code);
CREATE INDEX IF NOT EXISTS idx_runs_created ON research_runs(created_at);

CREATE TABLE IF NOT EXISTS tester_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  researcher_id INTEGER NOT NULL,
  app_version TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('workflow', 'measurement', 'report', 'dicom', 'interface', 'performance', 'other')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  steps TEXT NOT NULL,
  expected TEXT NOT NULL DEFAULT '',
  actual TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (researcher_id) REFERENCES researchers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_reports_researcher ON tester_reports(researcher_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON tester_reports(created_at);

CREATE TABLE IF NOT EXISTS research_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON research_audit(created_at);
