DROP TRIGGER IF EXISTS packages_au;

CREATE TRIGGER packages_au AFTER
UPDATE ON packages WHEN old.name IS NOT new.name
OR old.description IS NOT new.description
OR old.tags IS NOT new.tags
OR old.type IS NOT new.type BEGIN
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
  (new.id, new.name, new.description, new.tags, new.type);

END;
