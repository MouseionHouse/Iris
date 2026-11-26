#!/bin/bash
# Makes a throwaway self-signed code-signing certificate with its key, as a .p12, for testing
# the action without an Apple account. Never commit what it makes.
#
#   actions/macos-sign/test/self-signed.sh <dir>
#
# Writes <dir>/test.p12 and <dir>/password. With macOS's own LibreSSL, by path (a Nix profile
# may put OpenSSL 3 first): `security import` reads its .p12 as it is.
set -euo pipefail
dir="${1:?a directory to write to}"
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
/usr/bin/openssl pkcs12 -export -inkey key.pem -in cert.pem -name "macos-sign test (self-signed)" \
	-passout "file:password" -out test.p12
rm -f key.pem cert.cnf
/usr/bin/openssl x509 -in cert.pem -noout -subject -enddate
rm -f cert.pem
