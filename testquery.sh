#!/bin/bash
curl -X 'POST' \
  'http://localhost:8529/_db/sdms/api/1/qry/exec/direct?client=something' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "mode": 0,
  "published": true,
  "qry_begin": "string",
  "qry_end": "string",
  "qry_filter": "",
  "params": "string",
  "limit": 0
}'
