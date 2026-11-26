#!/bin/bash
# Makes a throwaway self-signed code-signing certificate with its key, as a .p12, for testing
# the action without an Apple account. Never commit what it makes.
#
#   actions/macos-sign/test/self-signed.sh <dir> [with-chain]
#
# Writes <dir>/test.p12 and <dir>/password. With `with-chain`, the .p12 also carries Apple's
# Developer ID intermediate (../DeveloperIDG2CA.cer), as a .p12 exported with its chain does: the
# action must then find the intermediate in its keychain already and go on. With macOS's own LibreSSL, by path (a Nix profile
# may put OpenSSL 3 first): `security import` reads its .p12 as it is.
set -euo pipefail
dir="${1:?a directory to write to}"
chain="${2:-}"
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$dir"
chmod 700 "$dir"
cd "$dir"
cat >cert.cnf <<'EOF'
[req]
distinguished_name = dn
prompt = no
x509_extensions = ext
[dn]
CN = macos-sign test (self-signed)
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF
/usr/bin/openssl req -new -x509 -newkey rsa:2048 -nodes -days 1 -config cert.cnf -keyout key.pem -out cert.pem 2>/dev/null
/usr/bin/openssl rand -hex 16 >password
extra=()
if [[ "$chain" == with-chain ]]; then
	/usr/bin/openssl x509 -inform DER -in "$here/../DeveloperIDG2CA.cer" -out chain.pem
	extra=(-certfile chain.pem)
fi
/usr/bin/openssl pkcs12 -export -inkey key.pem -in cert.pem -name "macos-sign test (self-signed)" \
	${extra[@]+"${extra[@]}"} -passout "file:password" -out test.p12
rm -f key.pem cert.cnf chain.pem
/usr/bin/openssl x509 -in cert.pem -noout -subject -enddate
rm -f cert.pem
