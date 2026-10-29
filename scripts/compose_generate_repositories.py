#!/usr/bin/env python3
"""Generate shared Compose mounts and ROOT_PATH-relative repository paths."""
import argparse
import json
import os
from pathlib import Path
import re
import tempfile


def initial_config(directory, environ):
    """Preserve existing mount settings when migrating an existing .env once."""
    origin = environ.get("DATAFED_REPO_ID_AND_DIR") or "bam"
    secondary = environ.get("DATAFED_SECONDARY_REPO_ID_AND_DIR") or "bambar"
    relative_entries = environ.get("DATAFED_REPO_IDS_AND_DIRS")
    entries = (relative_entries or environ.get("DATAFED_REPO_IDS")
               or origin + "," + secondary).split(",")
    primary_path = environ.get("DATAFED_HOST_COLLECTION_MOUNT") or str(Path.home() / "compose_collection")
    secondary_path = environ.get("DATAFED_HOST_SECONDARY_COLLECTION_MOUNT") or primary_path + "-" + secondary
    repositories = []
    for entry in entries:
        repo_id = entry.rsplit("/", 1)[-1] if relative_entries else entry
        host_path = primary_path if repo_id == origin else (
            secondary_path if repo_id == secondary else str(directory / "collections" / repo_id))
        repo = {"id": repo_id, "host_path": host_path}
        if entry != repo_id:
            repo["relative_path"] = entry
        repositories.append(repo)
    return {"authorization_origin": origin, "repositories": repositories}


def shared_service(config, directory):
    repositories = config.get("repositories")
    if not isinstance(repositories, list) or not repositories:
        raise ValueError("repositories must be a nonempty list")
    ids, paths, relative_paths, volumes = [], [], [], []
    for repo in repositories:
        if not isinstance(repo, dict):
            raise ValueError("Each repository must contain id or relative_path, and host_path")
        relative_path = repo.get("relative_path", repo.get("id"))
        if (not isinstance(relative_path, str) or not re.fullmatch(r"[a-zA-Z0-9_./-]+", relative_path)
                or any(part in ("", ".", "..") for part in relative_path.split("/"))):
            raise ValueError("Invalid repository relative_path or ID: " + repr(relative_path))
        repo_id = repo.get("id", relative_path.rsplit("/", 1)[-1])
        if (not isinstance(repo_id, str) or not re.fullmatch(r"[a-z0-9_.-]{1,40}", repo_id)
                or repo_id in (".", "..") or repo_id in ids):
            raise ValueError("Invalid or duplicate repository ID: " + repr(repo_id))
        if repo_id != relative_path.rsplit("/", 1)[-1]:
            raise ValueError("Repository ID must match the final component of relative_path: " + repo_id)
        if any(relative_path == other or relative_path.startswith(other + "/")
               or other.startswith(relative_path + "/") for other in relative_paths):
            raise ValueError("Repository relative paths must not overlap: " + relative_path)
        host_path = repo.get("host_path")
        if not isinstance(host_path, str) or not host_path.strip() or "\n" in host_path:
            raise ValueError("Repository " + repo_id + " needs a nonempty host_path")
        path = Path(host_path).expanduser()
        if not path.is_absolute():
            path = directory / path
        path = path.resolve()
        if path == Path(path.anchor):
            raise ValueError("A repository cannot mount the host filesystem root")
        if any(path == other or path in other.parents or other in path.parents for other in paths):
            raise ValueError("Repository host paths must be distinct and must not be nested: " + str(path))
        ids.append(repo_id)
        paths.append(path)
        relative_paths.append(relative_path)
        volumes.append({"type": "bind", "source": str(path).replace("$", "$$"),
                        "target": "${DATAFED_GCS_COLLECTION_ROOT_PATH:?Run generate_env.sh}/" + relative_path})
    origin = config.get("authorization_origin")
    if origin not in ids:
        raise ValueError("authorization_origin must name a configured repository")
    return {"environment": {"DATAFED_REPO_ID_AND_DIR": origin,
                            "DATAFED_REPO_IDS": ",".join(ids),
                            "DATAFED_REPO_IDS_AND_DIRS": ",".join(relative_paths)}, "volumes": volumes}


def write_json(path, value):
    # Replace atomically without following an existing output symlink.
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        try:
            json.dump(value, output, indent=2)
            output.write("\n")
            output.close()
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def generate(directory, environ):
    directory = Path(directory).resolve()
    config_path = directory / "repositories.json"
    config = json.loads(config_path.read_text()) if config_path.exists() else initial_config(directory, environ)
    if not isinstance(config, dict):
        raise ValueError("repositories.json must contain an object")
    service = shared_service(config, directory)
    if not config_path.exists():
        write_json(config_path, config)
    write_json(directory / ".repositories.compose.json", {"services": {"repository-storage": service}})
    return service["environment"]


def host_paths(directory):
    """Return the same validated bind sources used by both services."""
    directory = Path(directory).resolve()
    config = json.loads((directory / "repositories.json").read_text())
    if not isinstance(config, dict):
        raise ValueError("repositories.json must contain an object")
    return [volume["source"].replace("$$", "$")
            for volume in shared_service(config, directory)["volumes"]]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--host-paths", action="store_true",
                        help="Print validated host directories, separated by NUL, without changing files")
    args = parser.parse_args()
    try:
        if args.host_paths:
            for path in host_paths(args.directory):
                print(path, end="\0")
            raise SystemExit(0)
        settings = generate(args.directory, os.environ)
    except (OSError, ValueError) as error:
        parser.exit(1, "Repository configuration error: " + str(error) + "\n")
    for key, value in settings.items():
        print(key + "=" + value)
