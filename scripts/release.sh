#!/bin/zsh
# Builds a signed + notarized universal DMG of Nicky's Flock.
# Signing: Developer ID Application key + cert (PEM) -> temporary P12, removed afterwards.
# Notarization: App Store Connect API key from ~/.appstoreconnect.
set -euo pipefail
cd "${0:A:h}/.."

DEVID_DIR="${DEVID_DIR:?set DEVID_DIR to the folder with developer-id.key.pem, developer-id.cert.pem and developer-id-chain.pem}"
ASC_DIR="${ASC_DIR:-$HOME/.appstoreconnect}"

umask 077
mkdir -p .signing
trap 'rm -rf .signing' EXIT

P12_PASS="$(openssl rand -hex 24)"
openssl pkcs12 -export -legacy \
  -inkey "$DEVID_DIR/developer-id.key.pem" \
  -in "$DEVID_DIR/developer-id.cert.pem" \
  -certfile "$DEVID_DIR/developer-id-chain.pem" \
  -name "Developer ID Application: Darius Rosendahl (2R3888JL4F)" \
  -passout "pass:$P12_PASS" \
  -out .signing/devid.p12

source "$ASC_DIR/asc.env"
export CSC_LINK="$PWD/.signing/devid.p12"
export CSC_KEY_PASSWORD="$P12_PASS"
export APPLE_API_KEY="$ASC_DIR/private_keys/AuthKey_${ASC_KEY_ID}.p8"
export APPLE_API_KEY_ID="$ASC_KEY_ID"
export APPLE_API_ISSUER="$ASC_ISSUER_ID"

rm -rf dist/mac-universal* dist/*.dmg dist/*.dmg.blockmap
./node_modules/.bin/electron-builder --mac --universal --publish never

DMG="$(ls dist/*.dmg | head -1)"
APP="$(ls -d dist/mac-universal/*.app | head -1)"
echo "--- verify"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=2 "$APP" 2>&1 | grep -E "Authority=Developer ID Application|TeamIdentifier|Runtime|Timestamp"
spctl -a -vvv -t exec "$APP"
xcrun stapler validate "$APP"
xcrun stapler validate "$DMG" || echo "DMG ticket not stapled (the app inside is)"
spctl -a -vvv -t open --context context:primary-signature "$DMG" || true
shasum -a 256 "$DMG"
ls -la "$DMG"
