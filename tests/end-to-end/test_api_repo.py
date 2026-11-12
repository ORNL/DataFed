#!/usr/bin/env python3
# WARNING - to work with python environments we cannot use /bin/python3 or
#           a hardcoded abs path.
import json
import os
import sys
import time
import unittest


# Should only run after api login password test has been run
class TestDataFedPythonAPIRepo(unittest.TestCase):
    def setUp(self):
        path_of_file = os.path.abspath(__file__)
        current_folder = os.path.dirname(path_of_file)
        path_to_python_datafed_module = os.path.normpath(
            current_folder
            + os.sep
            + ".."
            + os.sep
            + ".."
            + os.sep
            + "python/datafed_pkg"
        )
        sys.path.insert(0, path_to_python_datafed_module)
        try:
            from datafed.CommandLib import API
        except ImportError:
            print(
                "datafed was not found, make sure you are running script with "
                "PYTHONPATH set to the location of the package in the datafed repo"
            )
            sys.exit(1)

        from datafed import version as df_ver

        print(df_ver)

        datafed_domain = os.environ.get("DATAFED_DOMAIN")
        opts = {"server_host": datafed_domain}
        self._df_api = API(opts)

        username = "datafed89"
        password = os.environ.get("DATAFED_USER89_PASSWORD")
        timeout  = int(os.environ.get('DATAFED_TEST_TIMEOUT_OVERRIDE', '1'))

        count = 0
        while True:
            try:
                self._df_api.loginByPassword(username, password)
                break
            except BaseException:
                pass
            count += 1
            # Try three times to authenticate
            assert count < 3

        path_to_repo_form = os.environ.get("DATAFED_REPO_FORM_PATH")
        if path_to_repo_form is None:
            self.fail("DATAFED_REPO_FORM_PATH env variable is not defined")

        if not path_to_repo_form.endswith(".json"):
            self.fail(
                "repo create test requires that the repo form exist and be "
                "provided as a json file, the test uses the environment "
                "variable DATAFED_REPO_PATH to search for the repo form"
            )

        self._repo_form = {}
        with open(path_to_repo_form) as json_file:
            self._repo_form = json.load(json_file)

        if len(self._repo_form["exp_path"]) == 0:
            print(
                "exp_path is empty, we will set it to / for the test. This is "
                "cruft and should be removed anyway"
            )
            self._repo_form["exp_path"] = "/"

        self._repo_form["admins"] = ["u/" + username]

    def test_repo_list(self):
        result = self._df_api.repoList(list_all=True)
        self.assertEqual(len(result[0].repo), 0)

    def test_repo_create_delete(self):
        result = self._df_api.repoCreate(
            repo_id=self._repo_form["id"],
            title=self._repo_form["title"],
            desc=self._repo_form["desc"],
            domain=self._repo_form["domain"],
            capacity=self._repo_form["capacity"],
            pub_key=self._repo_form["pub_key"],
            address=self._repo_form["address"],
            endpoint=self._repo_form["endpoint"],
            path=self._repo_form["path"],
            exp_path=self._repo_form["exp_path"],
            admins=self._repo_form["admins"],
        )

        self.assertEqual(len(result[0].repo), 1)

        self.assertEqual(result[0].repo[0].pub_key, self._repo_form["pub_key"])
        self.assertEqual(result[0].repo[0].capacity, self._repo_form["capacity"])
        self.assertEqual(result[0].repo[0].address, self._repo_form["address"])

        result = self._df_api.repoList(list_all=True)
        self.assertEqual(len(result[0].repo), 1)

        repo_id = self._repo_form["id"]
        if not repo_id.startswith("repo/"):
            repo_id = "repo/" + repo_id
        print(f"Delete repo {repo_id}")
        result = self._df_api.repoDelete(repo_id)
        result = self._df_api.repoList(list_all=True)
        self.assertEqual(len(result[0].repo), 0)

    @unittest.skipUnless(os.environ.get("DATAFED_REPO_FORMS_DIR"), "Requires generated repository forms")
    def test_shared_services_create_allocate_delete(self):
        forms = []
        for entry in os.environ["DATAFED_REPO_IDS_AND_DIRS"].split(","):
            repo_id = entry.rsplit("/", 1)[-1]
            path = os.path.join(os.environ["DATAFED_REPO_FORMS_DIR"], repo_id + "-repo-form.json")
            with open(path) as source:
                form = json.load(source)
            self.assertEqual(form["id"], repo_id)
            forms.append(form)
        self.assertEqual(forms[0]["id"], self._repo_form["id"])
        self.assertEqual(len({form["id"] for form in forms}), len(forms))
        self.assertEqual(len({form["path"].rstrip("/") for form in forms}), len(forms))
        for form in forms:
            for field in ("pub_key", "address", "endpoint"):
                self.assertEqual(self._repo_form[field], form[field])

        def wait_for_allocations(repo_id, count):
            for _ in range(20):
                if len(self._df_api.repoListAllocations(repo_id)[0].alloc) == count:
                    return
                time.sleep(1)
            self.fail(f"Expected {count} allocations on {repo_id}")

        def wait_for_task(response):
            task_id = response[0].task[0].id
            for _ in range(20):
                task = self._df_api.taskView(task_id)[0].task[0]
                if task.status >= 3:
                    self.assertEqual(task.status, 3, f"Repository task failed: {task}")
                    return
                time.sleep(1)
            self.fail(f"Repository task {task_id} did not complete")

        created = []
        allocated = []
        try:
            # Register the first repository (authorization origin) before all
            # others sharing this daemon, key, and guest collection.
            for form in forms:
                repo_id = form["id"]
                result = self._df_api.repoCreate(
                    repo_id=repo_id, title=form["title"], desc=form["desc"],
                    domain=form["domain"], capacity=form["capacity"],
                    pub_key=form["pub_key"], address=form["address"],
                    endpoint=form["endpoint"], path=form["path"],
                    exp_path=form["exp_path"] or "/", admins=self._repo_form["admins"],
                )
                created.append(repo_id if repo_id.startswith("repo/") else "repo/" + repo_id)
                self.assertEqual(result[0].repo[0].path.rstrip("/"), form["path"].rstrip("/"))
            self.assertEqual(len(self._df_api.repoList(list_all=True)[0].repo), len(forms))
            for repo_id in created:
                response = self._df_api.repoAllocationCreate(
                    repo_id=repo_id, subject="datafed89", data_limit=1000000000, rec_limit=100)
                allocated.append(repo_id)
                wait_for_task(response)
                wait_for_allocations(repo_id, 1)
        finally:
            # Origin is removed last, and allocations are removed before repos.
            for repo_id in reversed(allocated):
                response = self._df_api.repoAllocationDelete(repo_id=repo_id, subject="datafed89")
                wait_for_task(response)
                wait_for_allocations(repo_id, 0)
            for repo_id in reversed(created):
                self._df_api.repoDelete(repo_id)
        self.assertEqual(len(self._df_api.repoList(list_all=True)[0].repo), 0)


if __name__ == "__main__":
    suite = unittest.TestSuite()
    # Add them in the order they should be executed
    suite.addTest(TestDataFedPythonAPIRepo("test_repo_list"))
    suite.addTest(TestDataFedPythonAPIRepo("test_repo_create_delete"))
    suite.addTest(TestDataFedPythonAPIRepo("test_shared_services_create_allocate_delete"))
    runner = unittest.TextTestRunner()
    result = runner.run(suite)
    # wasSuccessful() return True which is not 0
    sys.exit(not result.wasSuccessful())
