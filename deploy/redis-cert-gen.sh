#!/bin/sh
# Generates the Redis TLS material (self-signed CA + server certificate)
# into /certs. Runs once as the redis-cert-gen init container in
# docker-compose.prod.yml; existing certificates are reused, so the
# redis-certs volume can persist across restarts.
#
# The CA key is deleted after signing: the CA is single-purpose and no
# other certificate will ever be issued from it. Wiping the volume
# regenerates everything on the next start.
set -eu

CERTS_DIR="${CERTS_DIR:-/certs}"
CA_KEY="$CERTS_DIR/ca.key"
CA_CERT="$CERTS_DIR/ca.crt"
SERVER_KEY="$CERTS_DIR/redis.key"
SERVER_CSR="$CERTS_DIR/redis.csr"
SERVER_CERT="$CERTS_DIR/redis.crt"
EXT_FILE="$CERTS_DIR/redis-ext.cnf"

if [ -f "$CA_CERT" ] && [ -f "$SERVER_CERT" ] && [ -f "$SERVER_KEY" ]; then
  echo "redis-cert-gen: certificates already present in $CERTS_DIR, reusing them"
  exit 0
fi

mkdir -p "$CERTS_DIR"

echo "redis-cert-gen: generating CA"
openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
  -keyout "$CA_KEY" -out "$CA_CERT" \
  -subj "/CN=weaver-redis-ca/O=Weaver"

echo "redis-cert-gen: generating server key + CSR"
openssl req -newkey rsa:4096 -sha256 -nodes \
  -keyout "$SERVER_KEY" -out "$SERVER_CSR" \
  -subj "/CN=redis/O=Weaver"

cat > "$EXT_FILE" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:redis,DNS:localhost,IP:127.0.0.1
EOF

echo "redis-cert-gen: signing server certificate (SAN: redis, localhost, 127.0.0.1)"
openssl x509 -req -sha256 -days 825 \
  -in "$SERVER_CSR" \
  -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
  -extfile "$EXT_FILE" \
  -out "$SERVER_CERT"

rm -f "$SERVER_CSR" "$EXT_FILE" "$CA_KEY" "$CA_CERT.srl"
chmod 600 "$SERVER_KEY"
chmod 644 "$CA_CERT" "$SERVER_CERT"

echo "redis-cert-gen: done"
