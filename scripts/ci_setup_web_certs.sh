#!/bin/bash

if [ ! -e "$DATAFED_WEB_CERT_PATH" ] || [ ! -e "$DATAFED_WEB_KEY_PATH" ]; then
  if [ -e "$DATAFED_WEB_CERT_PATH" ]; then
    rm "${DATAFED_WEB_CERT_PATH}"
  fi
  if [ -e "$DATAFED_WEB_KEY_PATH" ]; then
    rm "${DATAFED_WEB_KEY_PATH}"
  fi
  if [ -e "$DATAFED_WEB_CSR_PATH" ]; then
    rm "${DATAFED_WEB_CSR_PATH}"
  fi
  openssl genrsa -out "$DATAFED_WEB_KEY_PATH" 2048
  openssl req -new -key "$DATAFED_WEB_KEY_PATH" \
    -out "${DATAFED_WEB_CSR_PATH}" \
    -subj "/C=US/ST=TN/L=Oak Ridge/O=ORNL/OU=DLT/CN=${DI_DATAFED_DOMAIN}"
  openssl x509 -req -days 3650 \
    -in "${DATAFED_WEB_CSR_PATH}" \
    -signkey "$DATAFED_WEB_KEY_PATH" \
    -out "$DATAFED_WEB_CERT_PATH"
fi
