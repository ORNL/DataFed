#!/bin/python3
import json
import os
import subprocess
import sys
import time
import unittest

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
_df_api = API(opts)

username = "datafed89"
password = os.environ.get('DATAFED_USER89_PASSWORD') 
_df_api.loginByPassword(username, password)

path_to_repo_form = os.environ.get('DATAFED_REPO_FORM_PATH')
#if path_to_repo_form is None:
#    fail("DATAFED_REPO_FORM_PATH env variable is not defined")

#if not path_to_repo_form.endswith(".json"):
#    fail("repo create test requires that the repo form exist and be provided as a json file, the test uses the environment variable DATAFED_REPO_PATH to search for the repo form")

_repo_form = {}
with open(path_to_repo_form) as json_file:
    _repo_form = json.load(json_file)

# Create the repositories
result = _df_api.repoCreate(
        repo_id = _repo_form["id"],
        title = _repo_form["title"],
        desc = _repo_form["desc"],
        domain = _repo_form["domain"],
        capacity = _repo_form["capacity"],
        pub_key = _repo_form["pub_key"],
        address = _repo_form["address"],
        endpoint = _repo_form["endpoint"],
        path = _repo_form["path"],
        exp_path = _repo_form["exp_path"],
        admins = _repo_form["admins"])


result = _df_api.repoList(list_all = True)
count = 0
while len(result[0].repo) == 0:
    time.sleep(1)
    result = _df_api.repoList(list_all = True)
    count = count + 1
    if count > 3:
        fail("Setup failed with repo create")


repo_id = _repo_form["id"]
if not repo_id.startswith("repo/"):
    repo_id = "repo/" + repo_id

# Will return a task
result = _df_api.repoAllocationCreate(
        repo_id=repo_id,
        subject="datafed89",
        data_limit=1000000000,
        rec_limit=100)

task_id = result[0].task[0].id

# Check the status of the task
task_result = _df_api.taskView(task_id)

# If status is less than 3 it is in the works
status = task_result[0].task[0].status 
count = 0
while status < 3:
    if count > 2:
        print(task_result)
        fail("Something went wrong task was unable to complete, attempt to create an allocation after 3 seconds failed, make sure all services are running.")
        break
    time.sleep(1)
    task_result = _df_api.taskView(task_id)
    status = task_result[0].task[0].status 
    count = count + 1


