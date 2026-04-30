-- Migration number: 0002 	 2026-04-28T18:33:50.138Z
DROP TABLE IF EXISTS packages_fts;

DROP TRIGGER IF EXISTS packages_ai;

DROP TRIGGER IF EXISTS packages_ad;

DROP TRIGGER IF EXISTS packages_au;

CREATE VIRTUAL TABLE packages_fts USING fts5 (
  name,
  description,
  tags,
  type UNINDEXED,
  content = 'packages',
  content_rowid = 'id',
  tokenize = 'trigram'
);

INSERT INTO
  packages_fts (packages_fts)
VALUES
  ('rebuild');

CREATE TRIGGER packages_ai AFTER INSERT ON packages BEGIN
INSERT INTO
  packages_fts (rowid, name, description, tags, type)
VALUES
  (
    new.id,
    new.name,
    new.description,
    new.tags,
    new.type
  );

END;

CREATE TRIGGER packages_ad AFTER DELETE ON packages BEGIN
INSERT INTO
  packages_fts (
    packages_fts,
    rowid,
    name,
    description,
    tags,
    type
  )
VALUES
  (
    'delete',
    old.id,
    old.name,
    old.description,
    old.tags,
    old.type
  );

END;

CREATE TRIGGER packages_au AFTER
UPDATE ON packages WHEN old.name != new.name
OR old.description != new.description
OR old.tags != new.tags
OR old.type != new.type BEGIN
INSERT INTO
  packages_fts (
    packages_fts,
    rowid,
    name,
    description,
    tags,
    type
  )
VALUES
  (
    'delete',
    old.id,
    old.name,
    old.description,
    old.tags,
    old.type
  );

INSERT INTO
  packages_fts (rowid, name, description, tags, type)
VALUES
  (
    new.id,
    new.name,
    new.description,
    new.tags,
    new.type
  );

END;
