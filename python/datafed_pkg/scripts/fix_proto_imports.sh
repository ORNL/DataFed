#!/bin/sh
set -e

PROTO_DIR="$1"
ROOT_DIR="${2:-$1}"

if [ -z "$PROTO_DIR" ]; then
  echo "Usage: fix_proto_imports.sh <proto_output_dir> [root_dir]"
  echo "  proto_output_dir: directory to find and fix _pb2.py files"
  echo "  root_dir: package root for computing relative depth (defaults to proto_output_dir)"
  exit 1
fi

find "$PROTO_DIR" -name '*_pb2.py' | while read f; do
  relpath=$(realpath --relative-to="$ROOT_DIR" "$f")
  case "$relpath" in
  */*)
    sed -i \
      -e 's:^from anon import:from ..anon import:g' \
      -e 's:^from anon\.:from ..anon.:g' \
      -e 's:^from auth import:from ..auth import:g' \
      -e 's:^from auth\.:from ..auth.:g' \
      -e 's:^from enums import:from ..enums import:g' \
      -e 's:^from enums\.:from ..enums.:g' \
      -e 's:^from messages import:from ..messages import:g' \
      -e 's:^from messages\.:from ..messages.:g' \
      -e 's:^import \(.*_pb2\):from . import \1:g' \
      "$f"
    ;;
  *)
    sed -i \
      -e 's:^from anon import:from .anon import:g' \
      -e 's:^from anon\.:from .anon.:g' \
      -e 's:^from auth import:from .auth import:g' \
      -e 's:^from auth\.:from .auth.:g' \
      -e 's:^from enums import:from .enums import:g' \
      -e 's:^from enums\.:from .enums.:g' \
      -e 's:^from messages import:from .messages import:g' \
      -e 's:^from messages\.:from .messages.:g' \
      -e 's:^import \(.*_pb2\):from . import \1:g' \
      "$f"
    ;;
  esac
done

for subdir in anon auth enums messages; do
  if [ -d "$ROOT_DIR/$subdir" ]; then
    touch "$ROOT_DIR/$subdir/__init__.py"
  fi
done

# Append re-exports to envelope_pb2.py for backward compatibility
# Connection.py uses getattr(envelope_module, class_name) for dynamic dispatch
echo "" >>"$ROOT_DIR/envelope_pb2.py"
echo "# Re-export all message and enum classes for dynamic lookup" >>"$ROOT_DIR/envelope_pb2.py"

for subdir in anon auth enums messages; do
  if [ -d "$ROOT_DIR/$subdir" ]; then
    for f in "$ROOT_DIR/$subdir"/*_pb2.py; do
      [ -f "$f" ] || continue
      module=$(basename "$f" .py)
      echo "from .$subdir.$module import *" >>"$ROOT_DIR/envelope_pb2.py"
    done
  fi
done
