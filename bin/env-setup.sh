#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER=db
LOCALSTACK_CONTAINER=localstack

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
	"awslocal kms list-keys | grep -q 9355ce66-56af-4c7e-abdd-7e3e0168220a" \
	"awslocal kms create-key \
		--key-spec ECC_NIST_P256 \
		--key-usage SIGN_VERIFY \
		--tags '[
			{\"TagKey\":\"_custom_id_\",\"TagValue\":\"9355ce66-56af-4c7e-abdd-7e3e0168220a\"},
			{\"TagKey\":\"_custom_key_material_\",\"TagValue\":\"MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgxY3VMVh+GxgEuDgkiMaXPAV1aObMotgdzzbL3hhycK6hRANCAAQAwo8N3QSO6GVQ2OsA1r1KMm0hESZ3M0g3MQ2Jyr9coKN4pOxSsQPBrtbi5LyyrHyx1GyzsgiR6aQTRdLNo1Z6\"}
		]'" \
	"kms key 9355ce66-56af-4c7e-abdd-7e3e0168220a"

# signing key spki fingerprint setup
kms_key_id="9355ce66-56af-4c7e-abdd-7e3e0168220a"
public_key_b64=$(docker compose exec "$LOCALSTACK_CONTAINER" \
	awslocal kms get-public-key --key-id "$kms_key_id" --query 'PublicKey' --output text 2>/dev/null)

if [ -z "$public_key_b64" ]; then
	echo "Error: Failed to retrieve public key for ID '$kms_key_id'." >&2
	echo "Please ensure the KMS key exists." >&2
	exit 1
fi

env_file="registry/.env"
spki_fingerprint=$(bash ./bin/generate-key-id.sh "$public_key_b64")

# set SIG_KEY_ID in .env
if grep -q "^SIG_KEY_ID=" "$env_file"; then
	sed -i.bak "s|^SIG_KEY_ID=.*|SIG_KEY_ID=$kms_key_id|" "$env_file"
else
	echo "SIG_KEY_ID=$kms_key_id" >> "$env_file"
fi

# set SIG_KEY_SPKI_FINGERPRINT in .env
if grep -q "^SIG_KEY_SPKI_FINGERPRINT=" "$env_file"; then
	sed -i.bak "s|^SIG_KEY_SPKI_FINGERPRINT=.*|SIG_KEY_SPKI_FINGERPRINT=$spki_fingerprint|" "$env_file"
else
	echo "SIG_KEY_SPKI_FINGERPRINT=$spki_fingerprint" >> "$env_file"
fi

rm -f "${env_file}.bak"

echo "✓ all resources ready"
