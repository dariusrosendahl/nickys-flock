#!/bin/zsh
# Signs, notarizes and staples the DMG that electron-builder produced (the app inside is already notarized).
set -euo pipefail
cd "${0:A:h}/.."
DEVID_DIR="${DEVID_DIR:?set DEVID_DIR to the folder with developer-id.key.pem, developer-id.cert.pem and developer-id-chain.pem}"
ASC_DIR="${ASC_DIR:-$HOME/.appstoreconnect}"
IDENTITY="Developer ID Application: Darius Rosendahl (2R3888JL4F)"
DMG="${1:-$(ls dist/*-mac.dmg | head -1)}"

umask 077
WORK="$(mktemp -d)"
KC="$WORK/sign.keychain-db"
KC_PASS="$(openssl rand -hex 24)"
P12_PASS="$(openssl rand -hex 24)"
cleanup() {
  security delete-keychain "$KC" 2>/dev/null || true
  # restore the user's keychain search list
  [[ -n "${OLD_LIST:-}" ]] && eval "security list-keychains -d user -s $OLD_LIST" || true
  rm -rf "$WORK"
}
trap cleanup EXIT

openssl pkcs12 -export -legacy -inkey "$DEVID_DIR/developer-id.key.pem" -in "$DEVID_DIR/developer-id.cert.pem" \
  -certfile "$DEVID_DIR/developer-id-chain.pem" -name "$IDENTITY" -passout "pass:$P12_PASS" -out "$WORK/id.p12"
security create-keychain -p "$KC_PASS" "$KC"
security set-keychain-settings -lut 3600 "$KC"
security unlock-keychain -p "$KC_PASS" "$KC"
security import "$WORK/id.p12" -k "$KC" -P "$P12_PASS" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$KC_PASS" "$KC" >/dev/null
OLD_LIST="$(security list-keychains -d user | tr -d '\n')"
eval "security list-keychains -d user -s \"$KC\" $OLD_LIST"

codesign --force --sign "$IDENTITY" --keychain "$KC" --timestamp "$DMG"
codesign --verify --verbose=2 "$DMG"

source "$ASC_DIR/asc.env"
xcrun notarytool submit "$DMG" --key "$ASC_DIR/private_keys/AuthKey_${ASC_KEY_ID}.p8" --key-id "$ASC_KEY_ID" --issuer "$ASC_ISSUER_ID" --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl -a -vvv -t open --context context:primary-signature "$DMG"
chmod 644 "$DMG"
shasum -a 256 "$DMG"
