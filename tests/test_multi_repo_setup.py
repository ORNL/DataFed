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
                     "scripts/globus/generate_repo_form.sh"):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / name, target)
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
            ["bash", "-c", 'source "$1"; printf "%s" "$DATAFED_REPO_IDS"',
             "bash", str(self.root / "config/datafed.sh")],
            text=True, capture_output=True, env=self.env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "bam,bambar")

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

    def test_ambiguous_gateway_name_fails_without_mutating_policy(self):
        (self.root / "state.json").write_text(json.dumps({"collections": [], "gateways": [
            {"id": "one", "display_name": "Test Storage Gateway"},
            {"id": "two", "display_name": "Test Storage Gateway"}]}))
        result = self.run_script("scripts/globus/setup_globus.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "active-policy.json").exists())

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


if __name__ == "__main__":
    unittest.main()
