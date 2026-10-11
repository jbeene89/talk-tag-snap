#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

work_dir=""
cleanup() {
  if [[ -n "$work_dir" ]]; then
    rm -rf -- "$work_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

if [[ -z "${ANDROID_KEYSTORE_BASE64:-}" ]]; then
  printf '%s\n' "decode=failed"
  exit 1
fi

work_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/soupy-upload-key.XXXXXX" 2>/dev/null)" || {
  printf '%s\n' "decode=failed"
  exit 1
}
if ! chmod 700 "$work_dir" 2>/dev/null; then
  printf '%s\n' "decode=failed"
  exit 1
fi
keystore="$work_dir/upload.keystore"
classes="$work_dir/classes"
if ! mkdir -m 700 "$classes" 2>/dev/null; then
  printf '%s\n' "decode=failed"
  exit 1
fi

if ! printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode >"$keystore" 2>/dev/null ||
  [[ ! -s "$keystore" ]]; then
  printf '%s\n' "decode=failed"
  exit 1
fi
if ! chmod 600 "$keystore" 2>/dev/null; then
  printf '%s\n' "decode=failed"
  exit 1
fi
unset ANDROID_KEYSTORE_BASE64
printf '%s\n' "decode=success"

if ! javac -g:none -d "$classes" scripts/SigningKeyVerifier.java >/dev/null 2>&1; then
  printf '%s\n' "verifier=failed"
  exit 1
fi

if ! java -cp "$classes" SigningKeyVerifier "$keystore" 2>/dev/null; then
  printf '%s\n' "verifier=failed"
  exit 1
fi
