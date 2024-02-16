# Compose Dev environment

The files in this folder are incomplete but are the start for setting up a full
docker compose instance of datafed.

## Generate self signed web key

openssl genrsa -out cert.key 2048
openssl req -new -key cert.key -out cert.csr
openssl x509 -req -days 3650 -in cert.csr -signkey cert.key -out cert.crt
