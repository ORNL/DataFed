#!/usr/bin/env python3
"""Generate the shared Compose mounts and repository IDs from repositories.json."""
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
    ids = (environ.get("DATAFED_REPO_IDS") or origin + "," + secondary).split(",")
    primary_path = environ.get("DATAFED_HOST_COLLECTION_MOUNT") or str(Path.home() / "compose_collection")
    secondary_path = environ.get("DATAFED_HOST_SECONDARY_COLLECTION_MOUNT") or primary_path + "-" + secondary
    repositories = []
    for repo_id in ids:
        host_path = primary_path if repo_id == origin else (
            secondary_path if repo_id == secondary else str(directory / "collections" / repo_id))
        repositories.append({"id": repo_id, "host_path": host_path})
    return {"authorization_origin": origin, "repositories": repositories}


def shared_service(config, directory):
    repositories = config.get("repositories")
    if not isinstance(repositories, list) or not repositories:
        raise ValueError("repositories must be a nonempty list")
    ids, paths, volumes = [], [], []
    for repo in repositories:
        if not isinstance(repo, dict):
            raise ValueError("Each repository must contain id and host_path")
        repo_id = repo.get("id")
        if (not isinstance(repo_id, str) or not re.fullmatch(r"[a-z0-9_.-]{1,40}", repo_id)
                or repo_id in (".", "..") or repo_id in ids):
            raise ValueError("Invalid or duplicate repository ID: " + repr(repo_id))
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
        volumes.append({"type": "bind", "source": str(path).replace("$", "$$"),
                        "target": "${DATAFED_GCS_COLLECTION_ROOT_PATH:?Run generate_env.sh}/" + repo_id})
    origin = config.get("authorization_origin")
    if origin not in ids:
        raise ValueError("authorization_origin must name a configured repository")
    return {"environment": {"DATAFED_REPO_ID_AND_DIR": origin,
                            "DATAFED_REPO_IDS": ",".join(ids)}, "volumes": volumes}


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
