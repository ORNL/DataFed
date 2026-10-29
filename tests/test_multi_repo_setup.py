"""Provisioning regression tests; Globus calls are replaced with a local CLI stub.

Run with: python3 -m unittest discover -s tests -p test_multi_repo_setup.py
"""
import ast
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import types
import unittest


SOURCE = Path(__file__).resolve().parents[1]


class MultiRepoSetupTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ("scripts/repo_paths.sh", "scripts/globus/setup_globus.sh",
                     "scripts/globus/generate_repo_form.sh", "scripts/globus/clean_globus.sh"):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(SOURCE / name, target)
        (self.root / "config").mkdir()
        (self.root / "config/datafed.sh").write_text("")
        (self.root / "keys").mkdir()
        (self.root / "keys/datafed-repo-key.pub").write_text("k" * 40)
        (self.root / "client.json").write_text("{}")
        (self.root / "bin").mkdir()
        cli = self.root / "bin/globus-connect-server"
        cli.write_text("""#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ['TEST_ROOT'])
state_file = root / 'state.json'
state = json.loads(state_file.read_text()) if state_file.exists() else {'gateways': [], 'collections': []}
args = sys.argv[1:]
with (root / 'calls.jsonl').open('a') as out:
    out.write(json.dumps(args) + '\\n')
name = os.environ['DATAFED_GCS_ROOT_NAME']
if args[:2] == ['storage-gateway', 'list']:
    print(json.dumps({'data': state['gateways']}))
elif args[:2] == ['collection', 'list']:
    print(json.dumps(state['collections']))
elif args[:3] == ['storage-gateway', 'create', 'posix']:
    state['gateways'].append({'id': 'gateway', 'display_name': args[3]})
elif args[:2] == ['collection', 'create']:
    state['collections'].append({'id': 'mapped', 'display_name': name + ' Collection Mapped'})
if '--restrict-paths' in args:
    policy = args[args.index('--restrict-paths') + 1][len('file:'):]
    (root / 'active-policy.json').write_text(pathlib.Path(policy).read_text())
state_file.write_text(json.dumps(state))
""")
        cli.chmod(0o755)
        host = self.root / "bin/host"
        host.write_text("#!/bin/sh\necho 'repo.example.org has address 127.0.0.1'\n")
        host.chmod(0o755)
        self.env = dict(os.environ, TEST_ROOT=str(self.root),
                        PATH=str(self.root / "bin") + ":" + os.environ["PATH"],
                        DATAFED_REPO_ID_AND_DIR="bam", DATAFED_REPO_IDS="bam,bambar",
                        DATAFED_REPO_IDS_AND_DIRS="",
                        DATAFED_GCS_COLLECTION_ROOT_PATH=str(self.root / "data"),
                        DATAFED_GCS_COLLECTION_BASE_PATH=str(self.root / "data"),
                        DATAFED_GCS_ROOT_NAME="Test", DATAFED_GLOBUS_SUBSCRIPTION="",
                        DATAFED_GLOBUS_ALLOWED_DOMAINS="example.org",
                        DATAFED_GLOBUS_CRED_FILE_PATH=str(self.root / "client.json"),
                        DATAFED_GLOBUS_REPO_USER="datafed", DATAFED_INSTALL_PATH=str(self.root),
                        DATAFED_REPO_DOMAIN="repo.example.org")

    def run_script(self, name, *args):
        return subprocess.run(["bash", str(self.root / name), *args], cwd=self.root,
                              env=self.env, text=True, capture_output=True)

    def test_setup_reconciles_all_paths_on_restart_and_removal(self):
        for _ in range(2):
            result = self.run_script("scripts/globus/setup_globus.sh")
            self.assertEqual(result.returncode, 0, result.stderr)
            policy = json.loads((self.root / "active-policy.json").read_text())
            self.assertEqual(policy["read_write"], [str(self.root / "data" / key)
                                                   for key in ("bam", "bambar")])
        for key in ("bam", "bambar"):
            for directory in ("user", "project"):
                self.assertTrue((self.root / "data" / key / directory).is_dir())
        state = json.loads((self.root / "state.json").read_text())
        self.assertEqual(len(state["gateways"]), 1)
        self.assertEqual(len(state["collections"]), 1)
        self.env["DATAFED_REPO_IDS"] = ""
        result = self.run_script("scripts/globus/setup_globus.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        policy = json.loads((self.root / "active-policy.json").read_text())
        self.assertEqual(policy["read_write"], [str(self.root / "data/bam")])

    def test_invalid_config_fails_before_any_globus_call(self):
        for ids in ("../bam", "bam,../other", "bam,bam", "bambar", "bam,", "bam,,bambar",
                    "bam,$(id)", "bam;id", "bam,bam/child", "bam, B", "bam\nbambar"):
            with self.subTest(ids=ids):
                self.env["DATAFED_REPO_IDS"] = ids
                result = self.run_script("scripts/globus/setup_globus.sh")
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((self.root / "calls.jsonl").exists())

    def test_nested_relative_paths_drive_policy_and_registration_forms(self):
        entries = ("path1/bam", "path2/foo", "path3/path5/images")
        self.env["DATAFED_REPO_IDS_AND_DIRS"] = ",".join(entries)
        # The new setting takes precedence over a previously configured flat list.
        self.env["DATAFED_REPO_IDS"] = "old"
        result = self.run_script("scripts/globus/setup_globus.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        policy = json.loads((self.root / "active-policy.json").read_text())
        self.assertEqual(policy["read_write"], [str(self.root / "data" / p) for p in entries])
        for entry in entries:
            self.assertTrue((self.root / "data" / entry / "user").is_dir())
            self.assertTrue((self.root / "data" / entry / "project").is_dir())
        state = json.loads((self.root / "state.json").read_text())
        state["collections"].append({"id": "guest", "display_name": "Test Collection Guest"})
        (self.root / "state.json").write_text(json.dumps(state))
        for base in (str(self.root / "data"), "/"):
            self.env["DATAFED_GCS_COLLECTION_BASE_PATH"] = base
            result = self.run_script("scripts/globus/generate_repo_form.sh", "-j", "-s")
            self.assertEqual(result.returncode, 0, result.stderr)
            for entry in entries:
                key = entry.rsplit("/", 1)[-1]
                expected = "/" + entry if base != "/" else str(self.root / "data" / entry)
                form = json.loads((self.root / (key + "-repo-form.json")).read_text())
                self.assertEqual(form["id"], key)
                self.assertEqual(form["endpoint"], "guest")
                self.assertEqual(form["path"], expected)
                result = subprocess.run(
                    ["bash", "-euc", 'source "$1"; printf "%s" "$DATAFED_REPO_RELATIVE_PATH"',
                     "bash", str(self.root / (key + "-repo-form.sh"))],
                    env=self.env, text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, expected)

    def test_unsafe_relative_paths_fail_before_any_globus_call(self):
        for entries in ("/bam", "path/bam,../other", "path/../bam", "./bam", "path/./bam",
                        "path//bam", "path/bam/", "path/bam,other/bam", "bam,bam/child",
                        "bam/child,bam", "path/foo,other", "path/bam,", ",path/bam",
                        "path/bam,,foo", "path/bam,$(id)", "path/bam,foo\nbar",
                        "path/BAM", "path/bam,other/" + "x" * 41):
            with self.subTest(entries=entries):
                self.env["DATAFED_REPO_IDS_AND_DIRS"] = entries
                result = self.run_script("scripts/globus/setup_globus.sh")
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertFalse((self.root / "calls.jsonl").exists())

    def test_symlinked_parent_of_nested_repository_is_rejected(self):
        (self.root / "data").mkdir()
        (self.root / "data/path1").symlink_to(self.root)
        self.env["DATAFED_REPO_IDS_AND_DIRS"] = "path1/bam"
        result = self.run_script("scripts/globus/setup_globus.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "calls.jsonl").exists())

    def test_cleanup_uses_exact_shared_resource_names(self):
        (self.root / "state.json").write_text(json.dumps({
            "gateways": [{"id": "other-gateway", "display_name": "Test Sister Storage Gateway"},
                         {"id": "gateway", "display_name": "Test Storage Gateway"}],
            "collections": [{"id": "other-collection", "display_name": "Test Sister Collection Mapped"},
                            {"id": "mapped", "display_name": "Test Collection Mapped"}]}))
        result = self.run_script("scripts/globus/clean_globus.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [json.loads(line) for line in (self.root / "calls.jsonl").read_text().splitlines()]
        deletions = [call for call in calls if call[1] == "delete"]
        self.assertEqual(deletions, [["collection", "delete", "mapped"],
                                     ["storage-gateway", "delete", "gateway"]])

    def test_cleanup_rejects_ambiguous_names_before_deleting_anything(self):
        (self.root / "state.json").write_text(json.dumps({
            "gateways": [{"id": str(i), "display_name": "Test Storage Gateway"} for i in range(2)],
            "collections": [{"id": "mapped", "display_name": "Test Collection Mapped"}]}))
        result = self.run_script("scripts/globus/clean_globus.sh")
        self.assertNotEqual(result.returncode, 0)
        calls = [json.loads(line) for line in (self.root / "calls.jsonl").read_text().splitlines()]
        self.assertTrue(all(call[1] == "list" for call in calls))

    def test_symlinked_repository_is_rejected(self):
        (self.root / "data").mkdir()
        (self.root / "data/bam").symlink_to(self.root)
        result = self.run_script("scripts/globus/setup_globus.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "calls.jsonl").exists())

    def test_symlinked_owner_directory_is_rejected(self):
        (self.root / "data/bam").mkdir(parents=True)
        (self.root / "data/bam/user").symlink_to(self.root)
        result = self.run_script("scripts/globus/setup_globus.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "calls.jsonl").exists())

    def test_root_outside_collection_is_rejected(self):
        self.env["DATAFED_GCS_COLLECTION_BASE_PATH"] = str(self.root / "data-other")
        result = self.run_script("scripts/globus/setup_globus.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "calls.jsonl").exists())

    def test_generated_config_preserves_repository_list(self):
        self.env["DATAFED_REPO_IDS_AND_DIRS"] = "path1/bam,path2/foo,path3/path5/images"
        shutil.copyfile(SOURCE / "scripts/generate_datafed.sh",
                        self.root / "scripts/generate_datafed.sh")
        dependencies = self.root / "external/DataFedDependencies/scripts"
        dependencies.mkdir(parents=True)
        stub = dependencies / "generate_dependencies_config.sh"
        stub.write_text("#!/bin/sh\nexit 0\n")
        stub.chmod(0o755)
        result = self.run_script("scripts/generate_datafed.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        result = subprocess.run(
            ["bash", "-euc", 'source "$1"; source "$2"; datafed_load_repo_paths; '
             'printf "%s\\n" "$DATAFED_REPO_IDS" "$DATAFED_REPO_IDS_AND_DIRS" '
             '"${DATAFED_CONFIGURED_REPO_PATHS[@]}"',
             "bash", str(self.root / "config/datafed.sh"), str(self.root / "scripts/repo_paths.sh")],
            text=True, capture_output=True, env=self.env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["bam,bambar", self.env["DATAFED_REPO_IDS_AND_DIRS"],
                         *[str(self.root / "data" / entry) for entry in
                           self.env["DATAFED_REPO_IDS_AND_DIRS"].split(",")]])

    def test_form_generation_preserves_shared_collection_and_distinct_paths(self):
        state = {"gateways": [], "collections": [
            {"id": "wrong", "display_name": "Test Collection Guest Other"},
            {"id": "guest", "display_name": "Test Collection Guest"}]}
        (self.root / "state.json").write_text(json.dumps(state))
        result = self.run_script("scripts/globus/generate_repo_form.sh", "-j")
        self.assertEqual(result.returncode, 0, result.stderr)
        for key in ("bam", "bambar"):
            form = json.loads((self.root / (key + "-repo-form.json")).read_text())
            self.assertEqual(form["id"], key)
            self.assertEqual(form["endpoint"], "guest")
            self.assertEqual(form["path"], "/" + key)
            self.assertEqual(form["pub_key"], "k" * 40)

    def test_generated_launch_scripts_forward_relative_paths_to_both_containers(self):
        entries = "path1/bam,path2/foo,path3/path5/images"
        self.env["DATAFED_REPO_IDS_AND_DIRS"] = entries
        shutil.copy2(SOURCE / "scripts/generate_repo_container_scripts.sh", self.root / "scripts")
        docker = self.root / "bin/docker"
        docker.write_text("#!/usr/bin/env python3\nimport json, os, pathlib, sys\n"
                          "(pathlib.Path(os.environ['TEST_ROOT']) / 'docker-args.json').write_text("
                          "json.dumps(sys.argv[1:]))\n")
        docker.chmod(0o755)
        mounts = ",".join("/host/" + entry.rsplit("/", 1)[-1] + ":/mnt/data/" + entry
                          for entry in entries.split(","))
        result = self.run_script("scripts/generate_repo_container_scripts.sh", "-t", "test",
                                 "-i", "127.0.0.1", "-d", "repo.example.org", "-v", mounts)
        self.assertEqual(result.returncode, 0, result.stderr)
        for script in ("run_repo_container.sh", "run_gcs_container.sh"):
            result = self.run_script("scripts/" + script)
            self.assertEqual(result.returncode, 0, result.stderr)
            args = json.loads((self.root / "docker-args.json").read_text())
            self.assertIn("DATAFED_REPO_IDS_AND_DIRS=" + entries, args)
            self.assertIn("DATAFED_REPO_ID_AND_DIR=bam", args)
            for mount in mounts.split(","):
                self.assertIn(mount, args)

    def test_ambiguous_gateway_name_fails_without_mutating_policy(self):
        (self.root / "state.json").write_text(json.dumps({"collections": [], "gateways": [
            {"id": "one", "display_name": "Test Storage Gateway"},
            {"id": "two", "display_name": "Test Storage Gateway"}]}))
        result = self.run_script("scripts/globus/setup_globus.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "active-policy.json").exists())

    def test_startup_registration_summary_uses_each_generated_form(self):
        (self.root / "state.json").write_text(json.dumps({"gateways": [], "collections": [
            {"id": "guest", "display_name": "Test Collection Guest"}]}))
        entrypoint = (SOURCE / "repository/docker/entrypoint_authz.sh").read_text()
        start = entrypoint.index('"${BUILD_DIR}/scripts/globus/generate_repo_form.sh" -j -s')
        end = entrypoint.index('echo "Container is running."', start)
        prefix = 'source "$BUILD_DIR/scripts/repo_paths.sh"\ndatafed_load_repo_paths\n'
        env = dict(self.env, BUILD_DIR=str(self.root))
        # Exercise the real post-setup startup block for both supported bases.
        for base in (str(self.root / "data"), "/"):
            with self.subTest(base=base):
                env["DATAFED_GCS_COLLECTION_BASE_PATH"] = base
                result = subprocess.run(["bash", "-euc", prefix + entrypoint[start:end]],
                                        cwd=self.root, env=env, text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                for key in ("bam", "bambar"):
                    form_path = self.root / "globus" / (key + "-repo-form.json")
                    form = json.loads(form_path.read_text())
                    expected = "/" + key if base != "/" else str(self.root / "data" / key)
                    self.assertEqual(form["path"], expected)
                    self.assertIn("Repository: " + key, result.stdout)
                    self.assertIn("Path (relative to guest collection): " + expected, result.stdout)
                    self.assertIn("JSON form: " + str(form_path), result.stdout)
                    self.assertTrue(form_path.with_suffix(".sh").exists())
                self.assertIn('Register "bam" first', result.stdout)
                self.assertIn("Manage Data Repositories", result.stdout)
                self.assertIn("set capacity and administrators", result.stdout)

    def test_json_and_shell_forms_preserve_literal_values(self):
        title = 'Test "quoted" $HOME'
        public_key = "k$HOME" + "x" * 34
        self.env["DATAFED_GCS_ROOT_NAME"] = title
        (self.root / "keys/datafed-repo-key.pub").write_text(public_key)
        (self.root / "state.json").write_text(json.dumps({"gateways": [], "collections": [
            {"id": "guest", "display_name": title + " Collection Guest"}]}))
        result = self.run_script("scripts/globus/generate_repo_form.sh", "-j", "-s")
        self.assertEqual(result.returncode, 0, result.stderr)
        for key in ("bam", "bambar"):
            form = json.loads((self.root / (key + "-repo-form.json")).read_text())
            self.assertEqual(form["title"], title)
            self.assertEqual(form["pub_key"], public_key)
            result = subprocess.run(
                ["bash", "-euc", 'source "$1"; printf "%s\\n%s\\n%s" '
                 '"$DATAFED_REPO_ID" "$DATAFED_REPO_TITLE" "$DATAFED_REPO_PUBLIC_KEY"',
                 "bash", str(self.root / (key + "-repo-form.sh"))],
                env=self.env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), [key, title, public_key])

    def test_missing_or_changed_collection_cache_never_requests_automatic_deletion(self):
        # Load the pure decision function without authenticating to Globus.
        tree = ast.parse((SOURCE / "scripts/globus/create_guest_collection.py").read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                        and n.name == "should_recreate_guest_collection")
        for cached in (None, "/old", "/data/"):
            namespace = {"os": types.SimpleNamespace(getenv=lambda *a: "false"),
                         "utils": types.SimpleNamespace(get_cached_base_path=lambda *a: cached)}
            exec(compile(ast.Module(body=[function], type_ignores=[]), "decision", "exec"), namespace)
            decide = namespace[function.name]
            if cached == "/data/":
                self.assertFalse(decide("guest", "/data", "/cache")[0])
            else:
                with self.assertRaises(RuntimeError):
                    decide("guest", "/data", "/cache")

    def test_missing_cache_can_only_be_recovered_from_matching_authenticated_details(self):
        tree = ast.parse((SOURCE / "scripts/globus/create_guest_collection.py").read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                        and n.name == "should_recreate_guest_collection")
        namespace = {"os": types.SimpleNamespace(getenv=lambda *a: "false"),
                     "utils": types.SimpleNamespace(get_cached_base_path=lambda *a: None)}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "decision", "exec"), namespace)
        decide = namespace[function.name]
        good = {"id": "guest", "collection_type": "guest", "mapped_collection_id": "mapped",
                "identity_id": "owner", "collection_base_path": "/data/"}
        for details in (good, {**good, "id": "other"}, {**good, "collection_type": "mapped"},
                        {**good, "mapped_collection_id": "other"},
                        {**good, "identity_id": "other"},
                        {**good, "collection_base_path": "/elsewhere"},
                        {**good, "collection_base_path": None}, {**good, "collection_base_path": "~"}):
            with self.subTest(details=details):
                client = types.SimpleNamespace(get_collection=lambda *a: details)
                if details == good:
                    self.assertFalse(decide("guest", "/data", "/cache", client, "mapped", "owner")[0])
                else:
                    with self.assertRaises(RuntimeError):
                        decide("guest", "/data", "/cache", client, "mapped", "owner")
        def denied(*args):
            raise PermissionError("Not authorized")
        with self.assertRaisesRegex(RuntimeError, "no collection was deleted"):
            decide("guest", "/data", "/cache", types.SimpleNamespace(get_collection=denied), "mapped", "owner")


if __name__ == "__main__":
    unittest.main()
