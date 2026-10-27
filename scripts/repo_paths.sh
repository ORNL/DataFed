#!/bin/bash
# Shared by repository provisioning scripts. Source, then call
# datafed_load_repo_paths; this does not change the caller's shell options.

datafed_load_repo_paths() {
  local ids="${DATAFED_REPO_IDS:-${DATAFED_REPO_ID_AND_DIR:-}}"
  local anchor="${DATAFED_REPO_ID_AND_DIR:-}" id root seen="," found=false
  DATAFED_CONFIGURED_REPO_IDS=()
  DATAFED_CONFIGURED_REPO_PATHS=()

  if [[ ! "$ids" =~ ^[a-z0-9_.,-]+$ || "$ids" == ,* || "$ids" == *, || "$ids" == *,,* ]]; then
    echo "Repository IDs must be a nonempty comma-separated list" >&2
    return 1
  fi
  root="${DATAFED_GCS_COLLECTION_ROOT_PATH:-}"
  if [[ "$root" != /* ]]; then
    echo "DATAFED_GCS_COLLECTION_ROOT_PATH must be absolute" >&2
    return 1
  fi
  if [[ "$(realpath -m -- "$root")" != "$(realpath -ms -- "$root")" ]]; then
    echo "Repository root must not resolve through symbolic links" >&2
    return 1
  fi
  root="$(realpath -m -- "$root")" || return 1
  local base="${DATAFED_GCS_COLLECTION_BASE_PATH:-/}"
  if [[ "$base" != /* ]]; then
    echo "DATAFED_GCS_COLLECTION_BASE_PATH must be absolute" >&2
    return 1
  fi
  base="$(realpath -m -- "$base")" || return 1
  if [[ "$base" != / && "$root" != "$base" && "$root" != "$base/"* ]]; then
    echo "Repository root must be inside the collection base path" >&2
    return 1
  fi
  IFS=',' read -r -a DATAFED_CONFIGURED_REPO_IDS <<< "$ids"
  for id in "${DATAFED_CONFIGURED_REPO_IDS[@]}"; do
    # Match repository keys, but disallow path traversal and shell metacharacters.
    if [[ ! "$id" =~ ^[a-z0-9_.-]{1,40}$ || "$id" == . || "$id" == .. || "$seen" == *",$id,"* ]]; then
      echo "Invalid or duplicate repository ID: $id" >&2
      return 1
    fi
    seen+="$id,"
    [[ "$id" != "$anchor" ]] || found=true
    local repo_path="${root%/}/$id" child
    # Never provision through a symlink into another repository or directory.
    for child in "$repo_path" "$repo_path/user" "$repo_path/project"; do
      if [[ "$(realpath -m -- "$child")" != "$child" ]]; then
        echo "Repository directories must not be symbolic links: $child" >&2
        return 1
      fi
    done
    DATAFED_CONFIGURED_REPO_PATHS+=("$repo_path")
  done
  if [[ "$found" != true ]]; then
    echo "DATAFED_REPO_ID_AND_DIR must name a configured repository (authorization origin)" >&2
    return 1
  fi
}

datafed_print_repo_registration() {
  local forms_dir="$1" id form
  printf '\nDataFed repository registration required\n'
  echo "Storage setup does not automatically register repositories with DataFed."
  echo "Sign in to DataFed as a system administrator."
  echo "Open Manage Data Repositories and choose New for each repository below."
  echo "Copy its form values into the registration fields, set capacity and administrators, then Save."
  printf 'Register "%s" first and keep it registered: it is the shared authorization origin.\n' \
    "$DATAFED_REPO_ID_AND_DIR"

  for id in "${DATAFED_CONFIGURED_REPO_IDS[@]}"; do
    form="$forms_dir/$id-repo-form.json"
    # Read the same collection-relative path and UUID that the user will register.
    jq -er --arg id "$id" '
      if .id != $id then error("Repository form ID does not match configuration")
      else "\nRepository: \(.id)\n  Title: \(.title)\n  Srvr. Address: \(.address)\n  Public Key: \(.pub_key)\n  End-point ID: \(.endpoint)\n  Path (relative to guest collection): \(.path)" end
    ' "$form" || return 1
    printf '  JSON form: %s\n  Shell form: %s/%s-repo-form.sh\n' "$form" "$forms_dir" "$id"
  done
  echo
  echo "With the supplied Compose files, these forms are in ./globus/ beside compose.yml."
  echo "The repositories share a collection and service; register each ID with its own Path."
  echo "After registration, create user/project allocations on each repository before uploading data."
}
