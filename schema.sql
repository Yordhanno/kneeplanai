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
