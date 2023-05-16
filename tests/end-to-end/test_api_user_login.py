#!/bin/python3
import json
import os
import subprocess
import sys
import unittest

class TestDataFedPythonAPILogin(unittest.TestCase):
    def test_login_with_password(self):
        path_of_file = os.path.abspath(__file__)
        current_folder = os.path.dirname(path_of_file)
        path_to_python_datafed_module = os.path.normpath(current_folder + os.sep + ".." + os.sep + ".." + os.sep + "python/datafed_pkg")
        sys.path.insert(0, path_to_python_datafed_module) 
        print(sys.path)
        try:
            from datafed.CommandLib import API
        except ImportError:
            print("datafed was not found, make sure you are running script with PYTHONPATH set to the location of the package in the datafed repo")
            sys.exit(1)

        from datafed import version as df_ver
        print(df_ver)

        opts = {"server_host": "datafed-server-test.ornl.gov"}
        df_api = API(opts)

        username = "datafed99"
        password = os.environ.get('DATAFED_USER99_PASSWORD')
      
        count = 0
        while True:
            try:
                df_api.loginByPassword(username, password)
                break
            except:
                pass
            count += 1
            # Try three times to authenticate
            assert count < 3

        self.assertEqual(df_api.getAuthUser(), f"u/{username}")

if __name__ == '__main__':
    suite = unittest.TestSuite()
    # Add them in the order they should be executed
    suite.addTest(TestDataFedPythonAPILogin('test_login_with_password'))
    runner = unittest.TextTestRunner()
    result = runner.run(suite)
    print("Result value")
    print(result.wasSuccessful())
    # wasSuccessful() return True which is not 0
    sys.exit(not result.wasSuccessful())


