UPDATE package_version
SET dist = jsonb_set(
  dist,
  '{digest}',
  to_jsonb('sha256:' || encode(decode(substring(dist->>'digest' FROM 8), 'hex'), 'base64'))
)
WHERE length(dist->>'digest') = 71;
