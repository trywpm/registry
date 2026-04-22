ALTER TABLE package_version
  ALTER COLUMN description TYPE varchar(512),
  ALTER COLUMN license TYPE varchar(100),
  ALTER COLUMN homepage TYPE varchar(200);
