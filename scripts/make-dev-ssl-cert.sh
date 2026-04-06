#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
SSL_DIR="$DIR/.ssl"

mkdir -p "$SSL_DIR"

cd "$SSL_DIR"

if command -v mkcert >/dev/null 2>&1; then
    echo "mkcert found! Generating trusted local certificates..."
    mkcert -install
    mkcert -key-file localhost-key.pem -cert-file localhost.pem localhost 127.0.0.1 ::1
    echo "Done. Certificates created in .ssl/"
else
    echo "mkcert not found. Falling back to openssl (self-signed, browser will warn)..."
    openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
      -keyout localhost-key.pem -out localhost.pem \
      -subj "/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"
    echo "Done. Self-signed certificates created in .ssl/"
fi
