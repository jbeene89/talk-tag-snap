#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/soupy-key-verifier-test.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT
trap 'exit 1' HUP INT TERM

store="$scratch/test-upload.jks"
classes="$scratch/classes"
mkdir -m 700 "$classes"
store_password="fixture-store-password"
key_password="fixture-key-password"
alias_name="fixture-upload"

keytool -genkeypair -noprompt \
  -alias "$alias_name" \
  -keyalg RSA \
  -keysize 2048 \
  -dname "CN=Disposable Signing Test" \
  -validity 1 \
  -storetype JKS \
  -keystore "$store" \
  -storepass "$store_password" \
  -keypass "$key_password" >/dev/null 2>&1

fingerprint="$(
  keytool -exportcert -keystore "$store" -alias "$alias_name" \
    -storepass "$store_password" 2>/dev/null |
    sha256sum | awk '{ print toupper($1) }'
)"
base64_keystore="$(base64 <"$store" | tr -d '\n')"

javac -g:none -d "$classes" \
  "$repo_root/scripts/SigningKeyVerifier.java" \
  "$repo_root/scripts/SigningKeyVerifierTestHarness.java" >/dev/null 2>&1

assert_line() {
  local output="$1"
  local expected="$2"
  if ! grep -Fxq -- "$expected" <<<"$output"; then
    printf 'Missing expected verifier status: %s\n' "$expected" >&2
    exit 1
  fi
}

assert_line_precedes() {
  local output="$1"
  local earlier="$2"
  local later="$3"
  local earlier_line
  local later_line
  earlier_line="$(grep -nFx -- "$earlier" <<<"$output" | cut -d: -f1)"
  later_line="$(grep -nFx -- "$later" <<<"$output" | cut -d: -f1)"
  if [[ -z "$earlier_line" || -z "$later_line" || "$earlier_line" -ge "$later_line" ]]; then
    printf 'Verifier statuses appeared in an unexpected order\n' >&2
    exit 1
  fi
}

assert_exit() {
  local actual="$1"
  local expected="$2"
  if [[ "$actual" -ne "$expected" ]]; then
    printf 'Expected exit %s, got %s\n' "$expected" "$actual" >&2
    exit 1
  fi
}

assert_bounded_output() {
  local output="$1"
  while IFS= read -r line; do
    [[ "$line" =~ ^(decode|store_unlock|alias_access|private_key_access|certificate_match|verifier)=(success|failed)$ ]] ||
      [[ "$line" =~ ^certificate_sha256=[A-F0-9]{64}$ ]] || {
        printf 'Unexpected verifier output category\n' >&2
        exit 1
      }
    if [[ "$line" == *"$store_password"* || "$line" == *"$key_password"* ||
      "$line" == *"$alias_name"* || "$line" == *"Disposable Signing Test"* ]]; then
      printf 'Verifier output included fixture data\n' >&2
      exit 1
    fi
  done <<<"$output"
}

assert_temp_cleanup() {
  if find "$scratch" -mindepth 1 -maxdepth 1 -name 'soupy-upload-key.*' -print -quit |
    grep -q .; then
    printf 'Verifier left staged files behind\n' >&2
    exit 1
  fi
}

run_harness() {
  local expected="$1"
  local status=0
  harness_output="$(
    SOUPYTAG_STORE_PASSWORD="$store_password" \
      SOUPYTAG_KEY_PASSWORD="$key_password" \
      SOUPYTAG_KEY_ALIAS="$alias_name" \
      java -cp "$classes" SigningKeyVerifierTestHarness "$store" "$expected" 2>/dev/null
  )" || status=$?
  assert_bounded_output "$harness_output"
  harness_status="$status"
}

run_workflow_script() {
  local encoded="$1"
  local store_pass="$2"
  local key_pass="$3"
  local alias="$4"
  local status=0
  harness_output="$(
    cd "$repo_root" || exit 1
    RUNNER_TEMP="$scratch" TMPDIR="$scratch" \
      ANDROID_KEYSTORE_BASE64="$encoded" \
      SOUPYTAG_STORE_PASSWORD="$store_pass" \
      SOUPYTAG_KEY_PASSWORD="$key_pass" \
      SOUPYTAG_KEY_ALIAS="$alias" \
      bash "$repo_root/scripts/verify-android-upload-key.sh" 2>/dev/null
  )" || status=$?
  harness_status="$status"
  assert_bounded_output "$harness_output"
  assert_temp_cleanup
}

run_harness "$fingerprint"
assert_exit "$harness_status" 0
assert_line "$harness_output" "certificate_sha256=$fingerprint"
assert_line "$harness_output" "certificate_match=success"
assert_line "$harness_output" "private_key_access=success"

run_harness "0000000000000000000000000000000000000000000000000000000000000000"
assert_exit "$harness_status" 1
assert_line "$harness_output" "certificate_sha256=$fingerprint"
assert_line "$harness_output" "certificate_match=failed"
assert_line "$harness_output" "private_key_access=success"

run_workflow_script "$base64_keystore" "$store_password" "$key_password" "$alias_name"
assert_exit "$harness_status" 1
assert_line "$harness_output" "certificate_sha256=$fingerprint"
assert_line "$harness_output" "certificate_match=failed"
assert_line "$harness_output" "private_key_access=success"

run_workflow_script "$base64_keystore" "$store_password" "incorrect-key-password" "$alias_name"
assert_exit "$harness_status" 1
assert_line "$harness_output" "certificate_sha256=$fingerprint"
assert_line "$harness_output" "certificate_match=failed"
assert_line "$harness_output" "private_key_access=failed"
assert_line_precedes "$harness_output" "certificate_sha256=$fingerprint" "private_key_access=failed"

run_workflow_script "$base64_keystore" "incorrect-store-password" "$key_password" "$alias_name"
assert_exit "$harness_status" 1
assert_line "$harness_output" "store_unlock=failed"
if grep -q '^certificate_sha256=' <<<"$harness_output"; then
  printf 'Fingerprint emitted before store unlock\n' >&2
  exit 1
fi

run_workflow_script "$base64_keystore" "$store_password" "$key_password" "missing-alias"
assert_exit "$harness_status" 1
assert_line "$harness_output" "alias_access=failed"
if grep -q '^certificate_sha256=' <<<"$harness_output"; then
  printf 'Fingerprint emitted before alias access\n' >&2
  exit 1
fi

run_workflow_script "not-valid-base64!!" "$store_password" "$key_password" "$alias_name"
assert_exit "$harness_status" 1
assert_line "$harness_output" "decode=failed"
assert_temp_cleanup

printf '%s\n' "Synthetic upload-key verifier tests passed"
