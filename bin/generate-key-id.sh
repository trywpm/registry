#!/usr/bin/env bash
set -euo pipefail

sig_key_pub_key=$1

if [ -z "$sig_key_pub_key" ]; then
	echo "Usage: $0 <signing-key-public-key>" >&2
	exit 1
fi

BASE64_DIGEST=$(echo -n "$sig_key_pub_key" | base64 -d | \
	openssl pkey -pubin -inform DER -outform DER | \
	openssl dgst -sha256 -binary | \
	base64 -w 0)

echo "sha256:$BASE64_DIGEST"
