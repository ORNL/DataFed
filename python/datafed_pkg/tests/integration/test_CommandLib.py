#!/usr/bin/env python3
# WARNING - to work with python environments we cannot use /bin/python3 or
#           a hardcoded abs path.
"""
Integration tests for DataFed MessageLib.API class.

These tests assume a mock DataFed service is running externally and will
interact with it to test various scenarios including connection establishment,
authentication, message handling, and error conditions.
"""

import pytest
import os
import tempfile

# Assuming the module structure based on the imports in the source file
from datafed import CommandLib
from mock_defaults import Defaults

# Test configuration - adjust these based on your mock service setup


@pytest.fixture
def command_lib_options():
    """Create temporary key files for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:

        server_key_file = os.getenv(
            "DATAFED_MOCK_CORE_PUB_KEY", os.path.join(temp_dir, "server.key")
        )
        client_pub_key_file = os.path.join(temp_dir, "client.pub")
        client_priv_key_file = os.path.join(temp_dir, "client.priv")

        if os.path.exists(server_key_file):
            # grab the key from the file instead of writing the default key
            # to the file.
            with open(server_key_file, "r") as f:
                server_key = f.read().strip()
        else:
            with open(server_key_file, "w") as f:
                f.write(Defaults.mock_core_server_public_key)
            server_key = Defaults.mock_core_server_public_key

        with open(client_pub_key_file, "w") as f:
            f.write(Defaults.mock_python_client_public_key)
        with open(client_priv_key_file, "w") as f:
            f.write(Defaults.mock_python_client_private_key)

        yield {
            "client_pub_key_file": client_pub_key_file,
            "client_priv_key_file": client_priv_key_file,
            "server_pub_key_file": server_key_file,
            "server_port": Defaults.mock_core_server_port,
            "server_host": Defaults.mock_core_server_host,
        }


@pytest.fixture
def repo_create_options():
    """Create temporary key files for testing."""
    yield {
        "repo_id": Defaults.mock_repo_id,
        "title": Defaults.mock_repo_title,
        "desc": Defaults.mock_repo_desc,
        "capacity": Defaults.mock_repo_capacity,
        "pub_key": Defaults.mock_repo_pub_key,
        "address": Defaults.mock_repo_address,
        "endpoint": Defaults.mock_repo_globus_uuid,
        "path": Defaults.mock_repo_path,
        "type": Defaults.mock_repo_type,
        "admins": [Defaults.mock_repo_admin],
    }


class TestCommandLibRepo:
    """Test various connection establishment scenarios."""

    def test_successful_connection_with_key_files(self, command_lib_options, repo_create_options):
        """Test successful connection using key files."""
        api = CommandLib.API(command_lib_options)

        api.loginByPassword(Defaults.mock_authenticated_test_user, Defaults.test_user_password)

        result = api.repoCreate(
            repo_id=repo_create_options["repo_id"],
            title=repo_create_options["title"],
            desc=repo_create_options["desc"],
            capacity=repo_create_options["capacity"],
            pub_key=repo_create_options["pub_key"],
            address=repo_create_options["address"],
            endpoint=repo_create_options["endpoint"],
            path=repo_create_options["path"],
            admins=repo_create_options["admins"],
            domain="",
            exp_path="",
        )

        print("Result is")
        print(result)
        repo = result[0].repo[0]
        print(repo)
        print("Admins")
        print(repo.admin)
        assert repo.id == f"repo/{repo_create_options['repo_id']}"
        assert repo.title == repo_create_options["title"]
        assert repo.desc == repo_create_options["desc"]
        assert repo.capacity == repo_create_options["capacity"]
        assert repo.pub_key == repo_create_options["pub_key"]
        assert repo.address == repo_create_options["address"]
        assert repo.endpoint == repo_create_options["endpoint"]
        assert repo.admin == repo_create_options["admins"]
        assert repo.type == repo_create_options["type"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
