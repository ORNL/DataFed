"""Run with python3 -m unittest discover -s tests -p test_compose_repositories.py."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "compose_repositories", SOURCE / "scripts/compose_generate_repositories.py")
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class ComposeRepositoriesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def manifest(self, repositories, origin="bam"):
        config = {"authorization_origin": origin, "repositories": repositories}
        (self.directory / "repositories.json").write_text(json.dumps(config))

    def generated(self):
        return json.loads((self.directory / ".repositories.compose.json").read_text())["services"]["repository-storage"]

    def test_defaults_keep_two_repositories_and_migration_keeps_existing_mounts(self):
        settings = generator.generate(self.directory, {})
        self.assertEqual(settings["DATAFED_REPO_IDS"], "bam,bambar")
        self.assertEqual(settings["DATAFED_REPO_IDS_AND_DIRS"], "bam,bambar")
        self.assertEqual(len(self.generated()["volumes"]), 2)
        (self.directory / "repositories.json").unlink()
        settings = generator.generate(self.directory, {
            "DATAFED_REPO_ID_AND_DIR": "legacy", "DATAFED_REPO_IDS": "legacy,other",
            "DATAFED_SECONDARY_REPO_ID_AND_DIR": "other",
            "DATAFED_HOST_COLLECTION_MOUNT": "/srv/legacy",
            "DATAFED_HOST_SECONDARY_COLLECTION_MOUNT": "/archive/other"})
        self.assertEqual(settings["DATAFED_REPO_IDS"], "legacy,other")
        self.assertEqual([v["source"] for v in self.generated()["volumes"]],
                         ["/srv/legacy", "/archive/other"])

    def test_migration_preserves_relative_repository_directories(self):
        settings = generator.generate(self.directory, {
            "DATAFED_REPO_ID_AND_DIR": "bam", "DATAFED_REPO_IDS": "old",
            "DATAFED_REPO_IDS_AND_DIRS": "path1/bam,path2/foo,path3/path5/images"})
        self.assertEqual(settings["DATAFED_REPO_IDS"], "bam,foo,images")
        self.assertEqual(settings["DATAFED_REPO_IDS_AND_DIRS"],
                         "path1/bam,path2/foo,path3/path5/images")
        config = json.loads((self.directory / "repositories.json").read_text())
        self.assertEqual([repo["relative_path"] for repo in config["repositories"]],
                         settings["DATAFED_REPO_IDS_AND_DIRS"].split(","))

    def test_manifest_handles_many_repositories_and_overrides_old_environment(self):
        repositories = [{"id": "bam", "host_path": "./collections/bam"}]
        repositories += [{"id": "repo-" + str(i), "host_path": "./collections/repo-" + str(i)}
                         for i in range(10)]
        self.manifest(repositories)
        settings = generator.generate(self.directory, {"DATAFED_REPO_IDS": "old"})
        self.assertEqual(settings["DATAFED_REPO_IDS"].split(","), [r["id"] for r in repositories])
        self.assertEqual(len(self.generated()["volumes"]), 11)
        self.assertEqual(self.generated()["volumes"][0]["source"], str(self.directory / "collections/bam"))
        self.manifest(repositories[:1])
        generator.generate(self.directory, {})
        self.assertEqual(len(self.generated()["volumes"]), 1)

    def test_invalid_paths_ids_and_origins_do_not_replace_last_good_config(self):
        good = {"id": "bam", "host_path": "/srv/bam"}
        self.manifest([good])
        generator.generate(self.directory, {})
        previous = self.generated()
        cases = [([good, good], "bam"),
                 ([{"id": "../bam", "host_path": "/srv/bam"}], "../bam"),
                 ([{"id": "bam", "host_path": "/"}], "bam"),
                 ([{"id": "bam", "host_path": ""}], "bam"),
                 ([good, {"id": "other", "host_path": "/srv/bam/child"}], "bam"),
                 ([good, {"id": "other", "host_path": "/srv/bam"}], "bam"),
                 ([{"id": "bam", "relative_path": "path/foo", "host_path": "/srv/bam"}], "bam"),
                 ([{"relative_path": "path/bam", "host_path": "/srv/bam"},
                   {"relative_path": "other/bam", "host_path": "/srv/other"}], "bam"),
                 ([good, {"relative_path": "bam/child", "host_path": "/srv/child"}], "bam"),
                 ([good], "missing"), ([], "bam")]
        cases += [([{"relative_path": path, "host_path": "/srv/bam"}], "bam") for path in
                  ("/bam", "path/../bam", "./bam", "path/./bam", "path//bam", "path/bam/",
                   "path/bam,other", "path/$bam", "path/bam\n", "path/BAM", "", None)]
        for repositories, origin in cases:
            with self.subTest(repositories=repositories, origin=origin):
                self.manifest(repositories, origin)
                with self.assertRaises(ValueError):
                    generator.generate(self.directory, {})
                self.assertEqual(self.generated(), previous)

    def test_symlink_alias_cannot_mount_the_same_storage_as_another_repo(self):
        (self.directory / "data").mkdir()
        (self.directory / "alias").symlink_to(self.directory / "data")
        self.manifest([{"id": "bam", "host_path": "data"},
                       {"id": "other", "host_path": "alias"}])
        with self.assertRaises(ValueError):
            generator.generate(self.directory, {})

    def test_host_setup_uses_all_manifest_sources_without_appending_repo_ids(self):
        scripts = self.directory / "scripts"
        (scripts / "globus").mkdir(parents=True)
        shutil.copy2(SOURCE / "scripts/compose_generate_repositories.py", scripts)
        shutil.copy2(SOURCE / "scripts/globus/setup_collection_directory.sh", scripts / "globus")
        compose = self.directory / "compose/all"
        compose.mkdir(parents=True)
        paths = [self.directory / "storage/bam", self.directory / "storage/bambar",
                 self.directory / "third space $literal"]
        config = {"authorization_origin": "bam", "repositories": [
            {"id": name, "host_path": str(path)}
            for name, path in zip(("bam", "bambar", "third"), paths)]}
        (compose / "repositories.json").write_text(json.dumps(config))
        # No legacy host mount variable is present. Dotenv is read as data.
        marker = self.directory / "should-not-run"
        (compose / ".env").write_text(f"DATAFED_UID={os.getuid()}\nUNRELATED=$(touch {marker})\n")
        command = ["bash", str(scripts / "globus/setup_collection_directory.sh"), "-c", "all"]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(all(path.is_dir() for path in paths))
        self.assertFalse((paths[0] / "bam").exists())
        self.assertFalse(marker.exists())
        self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)

    def test_globus_setup_rejects_invalid_manifest_before_remote_operations(self):
        scripts = self.directory / "scripts"
        scripts.mkdir()
        for name in ("compose_generate_globus_files.sh", "compose_generate_repositories.py"):
            shutil.copy2(SOURCE / "scripts" / name, scripts)
        (self.directory / ".env").write_text("")
        self.manifest([{"id": "../escape", "host_path": "/srv/data"}])
        result = subprocess.run(["bash", str(scripts / "compose_generate_globus_files.sh"),
                                 "-d", str(self.directory)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid repository relative_path or ID", result.stderr)
        self.assertFalse((self.directory / "globus").exists())

    def test_environment_generator_migrates_once_then_uses_manifest(self):
        scripts = self.directory / "scripts"
        scripts.mkdir()
        for name in ("compose_generate_env.sh", "compose_generate_repositories.py"):
            shutil.copy2(SOURCE / "scripts" / name, scripts / name)
        dependencies = self.directory / "external/DataFedDependencies/scripts"
        dependencies.mkdir(parents=True)
        shutil.copyfile(SOURCE / "external/DataFedDependencies/scripts/dependency_versions.sh",
                        dependencies / "dependency_versions.sh")
        compose = self.directory / "compose"
        compose.mkdir()
        keys = compose / "keys"
        keys.mkdir()
        (keys / "cert.crt").touch()
        (keys / "cert.key").touch()
        (compose / ".env").write_text(
            "DATAFED_REPO_ID_AND_DIR=existing\nDATAFED_REPO_IDS=existing,bambar\n"
            "DATAFED_HOST_COLLECTION_MOUNT=/srv/existing\n"
            "DATAFED_HOST_SECONDARY_COLLECTION_MOUNT=/archive/bambar\n"
            "DATAFED_GCS_COLLECTION_ROOT_PATH=/custom/root\n"
            "DATAFED_GCS_COLLECTION_BASE_PATH=/\n")
        env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"]}
        command = ["bash", str(scripts / "compose_generate_env.sh"), "-d", str(compose), "-r", "-c"]
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads((compose / "repositories.json").read_text())
        self.assertEqual(config["repositories"][0]["host_path"], "/srv/existing")
        self.assertEqual(config["repositories"][1]["host_path"], "/archive/bambar")
        config["repositories"].append({"relative_path": "nested/third", "host_path": "/srv/third"})
        (compose / "repositories.json").write_text(json.dumps(config))
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        dotenv = (compose / ".env").read_text()
        self.assertIn("DATAFED_REPO_IDS=existing,bambar,third\n", dotenv)
        self.assertIn("DATAFED_REPO_IDS_AND_DIRS=existing,bambar,nested/third\n", dotenv)
        self.assertIn("DATAFED_GCS_COLLECTION_ROOT_PATH=/custom/root\n", dotenv)
        self.assertNotIn("SECONDARY", dotenv)
        self.assertNotIn("HOST_COLLECTION_MOUNT", dotenv)

    @unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI is required for rendering")
    def test_both_compose_files_inherit_all_mounts_and_literal_host_paths(self):
        plugin = subprocess.run(["docker", "compose", "version"], capture_output=True)
        if plugin.returncode:
            self.skipTest("Docker Compose plugin is unavailable")
        repositories = [{"id": "bam", "relative_path": "path1/bam", "host_path": "./data/bam"},
                        {"id": "bambar", "host_path": "./data/bambar"},
                        {"relative_path": "path3/path5/images", "host_path": "./data/$literal images"}]
        self.manifest(repositories)
        generator.generate(self.directory, {})
        (self.directory / ".env").write_text(
            "DATAFED_GCS_COLLECTION_ROOT_PATH=/mnt/data\n"
            "DATAFED_CONTAINER_LOG_PATH=/opt/datafed/logs\n"
            "DATAFED_ARANGODB_VERSION=3.12.12.1\n")
        for kind in ("all", "repo"):
            with self.subTest(kind=kind):
                shutil.copyfile(SOURCE / "compose" / kind / "compose.yml", self.directory / "compose.yml")
                command = ["docker", "compose", "-f", "compose.yml", "config", "--format", "json"]
                env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"]}
                result = subprocess.run(command, cwd=self.directory, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                services = json.loads(result.stdout)["services"]
                self.assertNotIn("repository-storage", services)
                for name in ("datafed-repo", "datafed-gcs"):
                    service = services[name]
                    self.assertEqual(service["environment"]["DATAFED_REPO_IDS"], "bam,bambar,images")
                    self.assertEqual(service["environment"]["DATAFED_REPO_IDS_AND_DIRS"],
                                     "path1/bam,bambar,path3/path5/images")
                    self.assertEqual(service["environment"]["DATAFED_REPO_ID_AND_DIR"], "bam")
                    actual = {v["target"]: v["source"] for v in service["volumes"]}
                    for repo in repositories:
                        # Compose's canonical output retains $$ escapes so the
                        # rendered document can itself be used as Compose input.
                        self.assertEqual(actual["/mnt/data/" + repo.get("relative_path", repo.get("id"))],
                                         str(self.directory / repo["host_path"]).replace("$", "$$"))


if __name__ == "__main__":
    unittest.main()
