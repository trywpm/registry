#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER=db
LOCALSTACK_CONTAINER=localstack

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
	"awslocal ses list-identities | grep -q no-reply@dev.wpm.so" \
	"awslocal ses verify-email-identity --email no-reply@dev.wpm.so" \
	"ses identity no-reply@dev.wpm.so"

maybe_create_resource "$LOCALSTACK_CONTAINER" \
	"awslocal kms list-keys | grep -q bfee8dd8-0f5a-472e-b309-7bd0d2f38622" \
	"awslocal kms create-key --key-spec ECC_NIST_P256 --key-usage SIGN_VERIFY --tags '[{\"TagKey\":\"_custom_id_\",\"TagValue\":\"bfee8dd8-0f5a-472e-b309-7bd0d2f38622\"}]'" \
	"kms key bfee8dd8-0f5a-472e-b309-7bd0d2f38622"

# signing key spki fingerprint setup
kms_key_id="bfee8dd8-0f5a-472e-b309-7bd0d2f38622"
public_key_b64=$(docker compose exec "$LOCALSTACK_CONTAINER" \
	awslocal kms get-public-key --key-id "$kms_key_id" --query 'PublicKey' --output text 2>/dev/null)

if [ -z "$public_key_b64" ]; then
	echo "Error: Failed to retrieve public key for ID '$kms_key_id'." >&2
	echo "Please ensure the KMS key exists." >&2
	exit 1
fi

env_file=".env"
spki_fingerprint=$(bash ./bin/generate-key-id.sh "$public_key_b64")

# set KMS_SPKI_FINGERPRINT in .env
if grep -q "^KMS_SPKI_FINGERPRINT=" "$env_file"; then
	sed -i.bak "s|^KMS_SPKI_FINGERPRINT=.*|KMS_SPKI_FINGERPRINT=$spki_fingerprint|" "$env_file"
else
	echo "KMS_SPKI_FINGERPRINT=$spki_fingerprint" >> "$env_file"
fi

# set KMS_PUBLIC_KEY in .env
if grep -q "^KMS_PUBLIC_KEY=" "$env_file"; then
	sed -i.bak "s|^KMS_PUBLIC_KEY=.*|KMS_PUBLIC_KEY=$public_key_b64|" "$env_file"
else
	echo "KMS_PUBLIC_KEY=$public_key_b64" >> "$env_file"
fi
rm -f "${env_file}.bak"

# set ses templates
package_published_failed_template=$(cat internal/aws/ses/templates/package-publish-failed.json)
package_published_success_template=$(cat internal/aws/ses/templates/package-publish-success.json)

package_published_failed_template_name=$(jq -r '.TemplateName' <<< "$package_published_failed_template")
package_published_success_template_name=$(jq -r '.TemplateName' <<< "$package_published_success_template")

package_published_failed_template_content=$(jq -c '.TemplateContent' <<< "$package_published_failed_template")
package_published_success_template_content=$(jq -c '.TemplateContent' <<< "$package_published_success_template")

docker compose exec "$LOCALSTACK_CONTAINER" \
	bash -c "\
		awslocal sesv2 create-email-template --template-name \"$package_published_failed_template_name\" --template-content '$package_published_failed_template_content' || echo 'Template $package_published_failed_template_name already exists, skipping...'
		awslocal sesv2 create-email-template --template-name \"$package_published_success_template_name\" --template-content '$package_published_success_template_content' || echo 'Template $package_published_success_template_name already exists, skipping...'
	"

echo "✓ all resources ready"
