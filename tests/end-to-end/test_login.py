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
        sys.path.append(path_to_python_datafed_module) 
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

        df_api.loginByPassword(username, password)
        self.assertEqual(df_api.getAuthUser(), f"u/{username}")

class TestDataFedPythonAPIRepo(unittest.TestCase):
    def setUp(self):
        path_of_file = os.path.abspath(__file__)
        current_folder = os.path.dirname(path_of_file)
        path_to_python_datafed_module = os.path.normpath(current_folder + os.sep + ".." + os.sep + ".." + os.sep + "python/datafed_pkg")
        sys.path.append(path_to_python_datafed_module) 
        try:
            from datafed.CommandLib import API
        except ImportError:
            print("datafed was not found, make sure you are running script with PYTHONPATH set to the location of the package in the datafed repo")
            sys.exit(1)

        from datafed import version as df_ver
        print(df_ver)

        opts = {"server_host": "datafed-server-test.ornl.gov"}
        self._df_api = API(opts)

        username = "datafed89"
        password = os.environ.get('DATAFED_USER89_PASSWORD')

        self._df_api.loginByPassword(username, password)

        path_to_repo_form = os.environ.get('DATAFED_REPO_FORM_PATH')
        if path_to_repo_form is None:
            self.fail("DATAFED_REPO_FORM_PATH env variable is not defined")

        if not path_to_repo_form.endswith(".json"):
            self.fail("repo create test requires that the repo form exist and be provided as a json file, the test uses the environment variable DATAFED_REPO_PATH to search for the repo form")
        
        self._repo_form = {}
        with open(path_to_repo_form) as json_file:
            self._repo_form = json.load(json_file)
 

    def test_repo_list(self):
        
        result = self._df_api.repoList(list_all = True)
        self.assertEqual( len(result[0].repo), 0)


    def test_repo_create(self):
     
        result = self._df_api.repoCreate(
                repo_id = self._repo_form["id"],
                title = self._repo_form["title"],
                desc = self._repo_form["desc"],
                domain = self._repo_form["domain"],
                capacity = self._repo_form["capacity"],
                pub_key = self._repo_form["pub_key"],
                address = self._repo_form["address"],
                endpoint = self._repo_form["endpoint"],
                path = self._repo_form["path"],
                exp_path = self._repo_form["exp_path"],
                admins = self._repo_form["admins"])

        self.assertEqual( len(result[0].repo), 1)
        
        self.assertEqual(result[0].repo[0].pub_key, self._repo_form["pub_key"])
        self.assertEqual(result[0].repo[0].capacity, self._repo_form["capacity"])
        self.assertEqual(result[0].repo[0].address, self._repo_form["address"])

        result = self._df_api.repoList(list_all = True)
        self.assertEqual( len(result[0].repo), 1)

    def test_repo_delete(self):
        repo_id = self._repo_form["id"]
        result = self._df_api.repoDelete(repo_id)
        result = self._df_api.repoList(list_all = True)
        self.assertEqual( len(result[0].repo), 0)


class TestDataFedPythonAPIRepoAlloc(unittest.TestCase):
    def setUp(self):
        path_of_file = os.path.abspath(__file__)
        current_folder = os.path.dirname(path_of_file)
        path_to_python_datafed_module = os.path.normpath(current_folder + os.sep + ".." + os.sep + ".." + os.sep + "python/datafed_pkg")
        sys.path.append(path_to_python_datafed_module) 
        try:
            from datafed.CommandLib import API
        except ImportError:
            print("datafed was not found, make sure you are running script with PYTHONPATH set to the location of the package in the datafed repo")
            sys.exit(1)

        from datafed import version as df_ver
        print(df_ver)

        opts = {"server_host": "datafed-server-test.ornl.gov"}
        self._df_api = API(opts)

        username = "datafed89"
        password = os.environ.get('DATAFED_USER89_PASSWORD')

        self._df_api.loginByPassword(username, password)

        path_to_repo_form = os.environ.get('DATAFED_REPO_FORM_PATH')
        if path_to_repo_form is None:
            self.fail("DATAFED_REPO_FORM_PATH env variable is not defined")

        if not path_to_repo_form.endswith(".json"):
            self.fail("repo create test requires that the repo form exist and be provided as a json file, the test uses the environment variable DATAFED_REPO_PATH to search for the repo form")
        
        self._repo_form = {}
        with open(path_to_repo_form) as json_file:
            self._repo_form = json.load(json_file)
 
        result = self._df_api.repoCreate(
                repo_id = self._repo_form["id"],
                title = self._repo_form["title"],
                desc = self._repo_form["desc"],
                domain = self._repo_form["domain"],
                capacity = self._repo_form["capacity"],
                pub_key = self._repo_form["pub_key"],
                address = self._repo_form["address"],
                endpoint = self._repo_form["endpoint"],
                path = self._repo_form["path"],
                exp_path = self._repo_form["exp_path"],
                admins = self._repo_form["admins"])

    def test_repo_alloc_list(self):
        result = self._df_api.repoListAllocations(self._repo_form["id"])

        print("Allocations")
        print(result)
        self.assertEqual( len(result[0].alloc), 0)

    def test_repo_alloc_create(self):

        result = self._df_api.repoListAllocationCreate(
                id=self._repo_form["id"],
                subject="datafed89",
                data_limits=1000000000,
                rec_limit=100)

        print("Allocations")
        print(result)
        self.assertEqual( len(result[0].alloc), 1)

    def test_repo_alloc_delete(self):

        result = self._df_api.repoListAllocationDelete(
                id=self._repo_form["id"],
                subject="datafed89")

        print("Delete Allocations")
        print(result)
        #self.assertEqual( len(result[0].alloc), 1)


#curl -X POST --header 'accept: application/json' --data-binary @- --dump - "http://${IP}:8529/_db/sdms/api/repo/create?client=u%2Fdatafed89" <<\
#EOF
#{
#  "id" : "$DATAFED_REPO_ID",
#  "title" : "$DATAFED_REPO_TITLE",
#  "desc" : "$DATAFED_REPO_DESCRIPTION", 
#  "domain" : "$DATAFED_REPO_DOMAIN", 
#  "capacity" : "$DATAFED_REPO_CAPACITY", 
#  "pub_key" : "$DATAFED_REPO_PUBLIC_KEY", 
#  "address" : "$DATAFED_REPO_SERVER_ADDRESS", 
#  "endpoint" : "$DATAFED_REPO_ENDPOINT_UUID", 
#  "path" : "$DATAFED_REPO_RELATIVE_PATH", 
#  "exp_path" : "$DATAFED_REPO_EXPORT_PATH", 
#  "admins" : ["u/datafed89"]
#}
#EOF
#
## Using the datafed89 client because it has the repo rights to create an allocation
## Creating an allocation for datafed89
#curl -X GET  "http://${IP}:8529/_db/sdms/api/repo/alloc/create?client=u%2Fdatafed89&subject=u%2Fdatafed89&repo=repo%2F${DATAFED_REPO_ID}&data_limit=1000000000&rec_limit=100" 
#
## Creating an allocation for datafed99
#curl -X GET  "http://${IP}:8529/_db/sdms/api/repo/alloc/create?client=u%2Fdatafed89&subject=u%2Fdatafed99&repo=repo%2F${DATAFED_REPO_ID}&data_limit=1000000000&rec_limit=100" 
#
#class TestDataFedPythonAPIContext(unittest.TestCase):
#    def test_context(self):
#
#        path_of_file = os.path.abspath(__file__)
#        current_folder = os.path.dirname(path_of_file)
#        path_to_python_datafed_module = os.path.normpath(current_folder + os.sep + ".." + os.sep + ".." + os.sep + "python/datafed_pkg")
#        sys.path.append(path_to_python_datafed_module) 
#        try:
#            from datafed.CommandLib import API
#        except ImportError:
#            print("datafed was not found, make sure you are running script with PYTHONPATH set to the location of the package in the datafed repo")
#            sys.exit(1)
#
#        from datafed import version as df_ver
#        print(df_ver)
#
#        opts = {"server_host": "datafed-server-test.ornl.gov"}
#        df_api = API(opts)
#
#        username = "datafed99"
#        password = os.environ.get('DATAFED_USER99_PASSWORD') 
#        df_api.loginByPassword(username, password)
#
#        context = df_api.getContext()
#
#        self.assertEqual(df_api.getContext(), f"u/{username}")
#
#class TestDataFedPythonAPIEndpoint(unittest.TestCase):
#    def setUp(self):
#        path_of_file = os.path.abspath(__file__)
#        current_folder = os.path.dirname(path_of_file)
#        path_to_python_datafed_module = os.path.normpath(current_folder + os.sep + ".." + os.sep + ".." + os.sep + "python/datafed_pkg")
#        sys.path.append(path_to_python_datafed_module) 
#        try:
#            from datafed.CommandLib import API
#        except ImportError:
#            print("datafed was not found, make sure you are running script with PYTHONPATH set to the location of the package in the datafed repo")
#            sys.exit(1)
#
#        from datafed import version as df_ver
#        print(df_ver)
#
#        opts = {"server_host": "datafed-server-test.ornl.gov"}
#        self._df_api = API(opts)
#
#        username = "datafed99"
#        password = os.environ.get('DATAFED_USER99_PASSWORD') 
#        self._df_api.loginByPassword(username, password)
#
#    def test_endpoint_set_and_default(self):
#        
#        endpoint = os.environ.get("DATAFED_REPO_ENDPOINT_UUID")
#        if endpoint is None:
#            self.fail("Cannot run end-to-end tests with Python CLI requires setting env variable DATAFED_REPO_ENDPOINT_UUID so that we know what to set the default endpoint to. This should be the same endpoint that the users have an allocation on... users datafed89 and datafed99")
#
#        if not df_api.endpointDefaultGet():
#            self._df_api.endpointDefaultSet(endpoint)
#
#        new_endpoint = self._df_api.endpointDefaultGet()
#        self.assertEqual(endpoint, new_endpoint)
#
#class TestDataFedPythonAPICollectionCRUD(unittest.TestCase):
#    def setUp(self):
#        path_of_file = os.path.abspath(__file__)
#        current_folder = os.path.dirname(path_of_file)
#        path_to_python_datafed_module = os.path.normpath(current_folder + os.sep + ".." + os.sep + ".." + os.sep + "python/datafed_pkg")
#        sys.path.append(path_to_python_datafed_module) 
#        try:
#            from datafed.CommandLib import API
#        except ImportError:
#            print("datafed was not found, make sure you are running script with PYTHONPATH set to the location of the package in the datafed repo")
#            sys.exit(1)
#
#        from datafed import version as df_ver
#        print(df_ver)
#
#        opts = {"server_host": "datafed-server-test.ornl.gov"}
#        self._df_api = API(opts)
#
#        username = "datafed99"
#        password = os.environ.get('DATAFED_USER99_PASSWORD') 
#        self._df_api.loginByPassword(username, password)
#
#    def test_collection_create(self):
#
#        col_result = self._df_api.collectionCreate(title="Materials", alias="materials", parent_id='root') 
#        print(col_result)
#

if __name__ == '__main__':
    suite = unittest.TestSuite()
    # Add them in the order they should be executed
    suite.addTest(TestDataFedPythonAPILogin('test_login_with_password'))
    suite.addTest(TestDataFedPythonAPIRepo('test_repo_list'))
    suite.addTest(TestDataFedPythonAPIRepo('test_repo_create'))
    suite.addTest(TestDataFedPythonAPIRepo('test_repo_delete'))
    suite.addTest(TestDataFedPythonAPIRepoAlloc('test_repo_alloc_list'))
    suite.addTest(TestDataFedPythonAPIRepoAlloc('test_repo_alloc_create'))
    suite.addTest(TestDataFedPythonAPIRepoAlloc('test_repo_alloc_delete'))

    #suite.addTest(TestDataFedPythonAPIContext('test_context'))
    #suite.addTest(TestDataFedPythonAPICollectionCRUD('test_collection_create'))
    runner = unittest.TextTestRunner()
    runner.run(suite)


