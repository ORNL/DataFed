#!/usr/bin/env python3
# WARNING - to work with python environments we cannot use /bin/python3 or
#           a hardcoded abs path.
import json
import os
import sys
import time
import unittest

# Depends on the success of the following tests
# 1. Login
# 2. Repo
# 3. Allocation
# 4. Collection


class TestDataFedPythonAPIRecordCRUD(unittest.TestCase):
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

        if datafed_domain is None:
            print("DATAFED_DOMAIN must be set before the end-to-end tests can be run")
            sys.exit(1)

        self._df_api = API(opts)

        self._username = "datafed89"
        password = os.environ.get("DATAFED_USER89_PASSWORD")

        self._timeout = int(os.environ.get('DATAFED_TEST_TIMEOUT_OVERRIDE', '1'));
        count = 0
        while True:
            try:
                self._df_api.loginByPassword(self._username, password)
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

        self._repo_form["admins"] = ["u/" + self._username]

        # Create the repositories
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

        result = self._df_api.repoList(list_all=True)
        count = 0
        while len(result[0].repo) == 0:
            time.sleep(self._timeout)
            result = self._df_api.repoList(list_all=True)
            count = count + 1
            if count > 3:
                self.fail("Setup failed with repo create")

        self._repo_id = self._repo_form["id"]
        if not self._repo_id.startswith("repo/"):
            self._repo_id = "repo/" + self._repo_id

        # Will return a task
        result = self._df_api.repoAllocationCreate(
            repo_id=self._repo_id,
            subject="datafed89",
            data_limit=1000000000,
            rec_limit=100,
        )

        task_id = result[0].task[0].id

        # Check the status of the task
        task_result = self._df_api.taskView(task_id)

        # If status is less than 3 it is in the works
        status = task_result[0].task[0].status
        count = 0
        while status < 3:
            if count > 2:
                print(task_result)
                self.fail(
                    "Something went wrong task was unable to complete, attempt "
                    "to create an allocation after 3 seconds failed, make sure "
                    "all services are running."
                )
                break
            time.sleep(self._timeout)
            task_result = self._df_api.taskView(task_id)
            status = task_result[0].task[0].status
            count = count + 1

    def test_record_create_delete(self):
        parameters = {
            "testing_tempareture": 900000,
            "voltage": [1, 2, -4, 7.123],
            "creator": "Lex Luther",
            "occupation": "super villan",
            "equipment_serial_numbers": {"SEM": 14, "AFM": 9134},
        }

        title = "Kryptonite"
        alias = "krpytonite"
        data_result = self._df_api.dataCreate(
            title=title,
            alias=alias,
            metadata=json.dumps(parameters),
            tags=["material"],
            parent_id="root",
        )

        self.assertEqual(data_result[0].data[0].title, title)
        self.assertEqual(data_result[0].data[0].alias, alias)
        data_id = data_result[0].data[0].id

        new_alias = "wonder_material"
        data_result_update = self._df_api.dataUpdate(data_id, alias=new_alias)
        self.assertEqual(data_result_update[0].update[0].alias, new_alias)

        # May not work depending on traffic
        esnet_uuid = "ece400da-0182-4777-91d6-27a1808f8371"

        put_task = self._df_api.dataPut(new_alias, esnet_uuid + "/1M.dat")

        task_id = put_task[0].task.id

        task_result = self._df_api.taskView(task_id)

        # If status is less than 3 it is in the works
        status = task_result[0].task[0].status
        count = 0
        while status < 3:
            if count > 30:
                break
            time.sleep(self._timeout)
            task_result = self._df_api.taskView(task_id)
            print("task Result **************")
            print(task_result)
            status = task_result[0].task[0].status
            count = count + 1

        # if status < 3:
        #    data_put_esnet_pass = True

        print(f"Status is {status}")
        assert status == 3
        print(task_result)
        print(f"Status is {status}")

        task_result = self._df_api.dataDelete(data_id)

        status = task_result[0].task[0].status
        count = 0
        while status < 3:
            if count > 20:
                break
            time.sleep(self._timeout)
            task_result = self._df_api.taskView(task_id)
            status = task_result[0].task[0].status
            count = count + 1

        assert status == 3
        # if not data_put_esnet_pass:
        # Try data from a different location

    def tearDown(self):

        result = self._df_api.repoAllocationDelete(
            repo_id=self._repo_id, subject="datafed89"
        )

        task_id = result[0].task[0].id

        # Check the status of the task
        task_result = self._df_api.taskView(task_id)

        # If status is less than 3 it is in the works
        status = task_result[0].task[0].status
        count = 0
        while status < 3:
            if count > 2:
                print(task_result)
                self.fail(
                    "Something went wrong task was unable to complete, attempt"
                    " to delete an allocation after 3 seconds failed, make sure"
                    " all services are running."
                )
                break
            time.sleep(self._timeout)
            task_result = self._df_api.taskView(task_id)
            status = task_result[0].task[0].status
            count = count + 1

        print("Delete Allocations")
        print(result)

        repo_id = self._repo_form["id"]
        if not repo_id.startswith("repo/"):
            repo_id = "repo/" + repo_id
        result = self._df_api.repoDelete(repo_id)
        result = self._df_api.repoList(list_all=True)


if __name__ == "__main__":
    suite = unittest.TestSuite()
    # Add them in the order they should be executed
    suite.addTest(TestDataFedPythonAPIRecordCRUD("test_record_create_delete"))
    runner = unittest.TextTestRunner()
    result = runner.run(suite)
    # wasSuccessful() return True which is not 0
    sys.exit(not result.wasSuccessful())
