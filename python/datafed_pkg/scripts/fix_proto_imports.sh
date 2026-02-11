#!/bin/sh
set -e

# What this script does
#
# protoc --python_out
#
# generates _pb2.py files with absolute imports based on the proto import
# paths. For example, if envelope.proto imports anon/auth_by_token.proto, the
# generated envelope_pb2.py will contain:
#
# python from anon import auth_by_token_pb2
#

# This works if you run Python from the exact output directory, but breaks when
# the generated code is consumed as a Python package (which is how DataFed uses
# it). Python's package system requires relative imports for intra-package
# references:
#
# File at package level
#
# from .anon import auth_by_token_pb2
#
# File at root
#
# from ..anon import auth_by_token_pb2
#
# file in a subdirectory protoc
# has no option to emit relative imports. This is a well-known, long-standing
# limitation (protocolbuffers/protobuf#1491).  The script does three things:
# 
# 1. Rewrites imports to be relative. It finds every _pb2.py file, determines
# whether it lives at the package root or in a subdirectory (e.g., anon/,
# auth/), and rewrites bare absolute imports (from anon import ...) to the
# correct relative form (.anon for root-level files, ..anon for files one level
# deep).
# 2. Creates __init__.py files in each subdirectory (anon/, auth/, enums/,
# messages/) so Python recognizes them as subpackages.  Appends re-exports to
# envelope_pb2.py for backward compatibility. The existing Python client
# (Connection.py) uses getattr(envelope_module, ClassName) to dynamically look
# up message classes by name on the envelope module.
#
# Under the old single-file
# proto2 layout, all message classes lived directly in envelope_pb2.py. Now
# that messages are split across subpackages, this dynamic lookup would break.
# The wildcard re-exports (from .anon.auth_by_token_pb2 import *, etc.) restore
# the flat namespace on envelope_pb2 so existing code continues to work without
# modification.

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
