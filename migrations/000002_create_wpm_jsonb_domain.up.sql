-- we generally don't need this domain, but creating it for type inference in sqlc
-- see query files and sqlc config for usage
CREATE DOMAIN wpm_jsonb AS jsonb;
