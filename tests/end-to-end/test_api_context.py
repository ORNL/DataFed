#!/bin/python3
import json
import os
import subprocess
import sys
import unittest

# Depends on the provided tests first passing
# user_login
class TestDataFedPythonAPIContext(unittest.TestCase):
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
                "datafed was not found, make sure you are running script with PYTHONPATH set to the location of the package in the datafed repo"
            )
            sys.exit(1)

        from datafed import version as df_ver

        print(df_ver)

        opts = {"server_host": "datafed-server-test.ornl.gov"}
        self._df_api = API(opts)

        self._username = "datafed99"
        password = os.environ.get("DATAFED_USER99_PASSWORD")

        count = 0
        while True:
            try:
                result = self._df_api.loginByPassword(self._username, password)
                break
            except:
                pass
            count += 1
            # Try three times to authenticate
            assert count < 3

    def test_context(self):

        context = self._df_api.getContext()
        self.assertEqual(self._df_api.getContext(), f"u/{self._username}")


if __name__ == "__main__":
    suite = unittest.TestSuite()
    # Add them in the order they should be executed
    suite.addTest(TestDataFedPythonAPIContext("test_context"))
    runner = unittest.TextTestRunner()
    result = runner.run(suite)
    # wasSuccessful() return True which is not 0
    sys.exit(not result.wasSuccessful())
