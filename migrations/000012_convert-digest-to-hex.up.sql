-- Migrate digest encoding from base64 to hex.
UPDATE package_version
SET dist = jsonb_set(
  dist,
  '{digest}',
  to_jsonb('sha256:' || encode(decode(substring(dist->>'digest' FROM 8), 'base64'), 'hex'))
)
WHERE length(dist->>'digest') = 51;
