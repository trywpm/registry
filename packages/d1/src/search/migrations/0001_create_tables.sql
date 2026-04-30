-- Migration number: 0001 	 2026-04-25T18:40:43.683Z
CREATE TABLE packages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('theme', 'plugin', 'mu-plugin')),
  version TEXT NOT NULL,
  description TEXT,
  tags JSON DEFAULT '[]',
  license TEXT,
  package_published TEXT NOT NULL,
  downloads_per_week INTEGER DEFAULT 0,
  dependent_count INTEGER DEFAULT 0,
  quality_score REAL DEFAULT 0
);

CREATE TABLE package_dependencies (
  source_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  PRIMARY KEY (source_name, target_name)
);

CREATE VIRTUAL TABLE packages_fts USING fts5 (
  name,
  description,
  tags,
  content = 'packages',
  content_rowid = 'id',
  tokenize = 'trigram'
);

CREATE INDEX idx_deps_target ON package_dependencies (target_name);

CREATE INDEX idx_packages_name ON packages (type, name ASC, id ASC);

CREATE INDEX idx_packages_rank_seek ON packages (type, quality_score DESC, id DESC);

CREATE INDEX idx_packages_recent ON packages (type, package_published DESC, id DESC);

CREATE INDEX idx_packages_downloads ON packages (type, downloads_per_week DESC, id DESC);

CREATE INDEX idx_packages_global_name ON packages (name ASC, id ASC);

CREATE INDEX idx_packages_global_rank ON packages (quality_score DESC, id DESC);

CREATE INDEX idx_packages_global_recent ON packages (package_published DESC, id DESC);

CREATE INDEX idx_packages_global_downloads ON packages (downloads_per_week DESC, id DESC);

CREATE TRIGGER packages_ai AFTER INSERT ON packages BEGIN
INSERT INTO
  packages_fts (rowid, name, description, tags)
VALUES
  (new.id, new.name, new.description, new.tags);

END;

CREATE TRIGGER packages_ad AFTER DELETE ON packages BEGIN
INSERT INTO
  packages_fts (packages_fts, rowid, name, description, tags)
VALUES
  (
    'delete',
    old.id,
    old.name,
    old.description,
    old.tags
  );

END;

CREATE TRIGGER packages_au AFTER
UPDATE ON packages WHEN old.name != new.name
OR old.description != new.description
OR old.tags != new.tags BEGIN
INSERT INTO
  packages_fts (packages_fts, rowid, name, description, tags)
VALUES
  (
    'delete',
    old.id,
    old.name,
    old.description,
    old.tags
  );

INSERT INTO
  packages_fts (rowid, name, description, tags)
VALUES
  (new.id, new.name, new.description, new.tags);

END;
