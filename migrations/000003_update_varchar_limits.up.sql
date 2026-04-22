-- since we have application level hard limits, we can safely increase the limits to text
-- this is due because chars can grow after sanitization of a string. for example, & becomes &amp;
ALTER TABLE package_version
  ALTER COLUMN description TYPE text,
  ALTER COLUMN license TYPE text,
  ALTER COLUMN homepage TYPE text;
