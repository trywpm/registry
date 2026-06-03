#!/usr/bin/env bash
set -euo pipefail

START_RESOURCES=${1:-true}

# Containers
DB_CONTAINER=db
LOCALSTACK_CONTAINER=localstack

# Dev env
APP_ENV=development

# Localstack aws env vars
AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://127.0.0.1:4566
AWS_ACCESS_KEY_ID=admin
AWS_SECRET_ACCESS_KEY=password

# S3 bucket
S3_BUCKET=wpm-registry

# PAT token HMAC key
PAT_HMAC_KEY="04fdb4b2f1e28861e16d07f6cb51e495890759519ba2a7c8791e31a35345a290"

# KMS signing key ID
SIG_KEY_ID=9355ce66-56af-4c7e-abdd-7e3e0168220a
SIG_KEY_PUBLIC_KEY="MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAMKPDd0EjuhlUNjrANa9SjJtIREmdzNINzENicq/XKCjeKTsUrEDwa7W4uS8sqx8sdRss7IIkemkE0XSzaNWeg=="
SIG_KEY_SPKI_FINGERPRINT="sha256:qTML5vVX0DVHabsKmqf5URH0Ng1AV6I44wfuphzGB4E"

# Clerk dev env vars
VITE_CLERK_DOMAIN="handy-gnu-57.clerk.accounts.dev"
VITE_CLERK_PUBLISHABLE_KEY="pk_test_aGFuZHktZ251LTU3LmNsZXJrLmFjY291bnRzLmRldiQ"

# Postgres connection URL
DATABASE_URL="postgresql://wpm:wpm@localhost:5432/wpm?sslmode=disable"

# Write registry env vars.
registry_env_file="registry/.env"
{
	echo "APP_ENV=$APP_ENV"
	echo "AWS_REGION=$AWS_REGION"
	echo "AWS_ENDPOINT_URL=$AWS_ENDPOINT_URL"
	echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID"
	echo "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY"
	echo "S3_BUCKET=$S3_BUCKET"
	echo "PAT_HMAC_KEY=$PAT_HMAC_KEY"
	echo "SIG_KEY_ID=$SIG_KEY_ID"
	echo "SIG_KEY_SPKI_FINGERPRINT=$SIG_KEY_SPKI_FINGERPRINT"
} > "$registry_env_file"

# Write web env vars.
web_env_file="web/.env"
{
	echo "VITE_CLERK_DOMAIN=$VITE_CLERK_DOMAIN"
	echo "VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY"
} > "$web_env_file"

if [ "$START_RESOURCES" != "true" ]; then
	exit 0
fi

echo "Starting services and waiting for them to be healthy..."
docker compose up -d --wait

maybe_create_resource() {
	local container=$1
	local check_cmd=$2
	local create_cmd=$3
	local resource_name=$4

	if ! docker compose exec "$container" bash -c "$check_cmd" &>/dev/null; then
		echo "creating $resource_name..."
		docker compose exec "$container" bash -c "$create_cmd"
	else
		echo "$resource_name already exists, skipping..."
	fi
}

maybe_create_resource "$DB_CONTAINER" \
	"psql -U wpm -d wpm -c '\l' | grep -q wpm" \
	"psql -U wpm -d wpm -c 'CREATE DATABASE wpm;'" \
	"wpm database"

maybe_create_resource "$LOCALSTACK_CONTAINER" \
	"awslocal s3 ls | grep -q wpm-registry" \
	"awslocal s3 mb s3://wpm-registry" \
	"wpm-registry bucket"

maybe_create_resource "$LOCALSTACK_CONTAINER" \
	"awslocal kms list-keys | grep -q $SIG_KEY_ID" \
	"awslocal kms create-key \
		--key-spec ECC_NIST_P256 \
		--key-usage SIGN_VERIFY \
		--tags '[
			{\"TagKey\":\"_custom_id_\",\"TagValue\":\"$SIG_KEY_ID\"},
			{\"TagKey\":\"_custom_key_material_\",\"TagValue\":\"MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgxY3VMVh+GxgEuDgkiMaXPAV1aObMotgdzzbL3hhycK6hRANCAAQAwo8N3QSO6GVQ2OsA1r1KMm0hESZ3M0g3MQ2Jyr9coKN4pOxSsQPBrtbi5LyyrHyx1GyzsgiR6aQTRdLNo1Z6\"}
		]'" \
	"kms signing key"

# Run DB migrations.
echo "Running database migrations..."
# make migrate-up
export DATABASE_URL
make migrate-up
vp run -r d1-migration

echo "✓ all resources ready"
