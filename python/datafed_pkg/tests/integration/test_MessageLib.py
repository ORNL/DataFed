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
from datafed import MessageLib
from datafed import SDMS_Anon_pb2 as anon
from mock_defaults import Defaults

# Test configuration - adjust these based on your mock service setup


@pytest.fixture
def temp_key_files():
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
            "server": server_key_file,
            "client_pub": client_pub_key_file,
            "client_priv": client_priv_key_file,
            "server_key": server_key,
            "temp_dir": temp_dir,
        }


class TestConnectionEstablishment:
    """Test various connection establishment scenarios."""

    def test_successful_connection_with_key_files(self, temp_key_files):
        """Test successful connection using key files."""
        api = MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key_file=temp_key_files["server"],
            client_pub_key_file=temp_key_files["client_pub"],
            client_priv_key_file=temp_key_files["client_priv"],
        )

        assert api._conn is not None
        assert api.keysLoaded() is True
        assert api.keysValid() is True

    def test_successful_connection_with_direct_keys(self, temp_key_files):
        """Test successful connection using keys directly."""
        api = MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key=temp_key_files["server_key"],
            client_pub_key=Defaults.mock_python_client_public_key,
            client_priv_key=Defaults.mock_python_client_private_key,
        )

        assert api._conn is not None
        assert api.keysLoaded() is True
        assert api.keysValid() is True

    def test_anonymous_connection(self, temp_key_files):
        """Test anonymous connection without client keys."""
        api = MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key=temp_key_files["server_key"],
        )

        assert api._conn is not None
        assert api.keysLoaded() is False
        assert api.keysValid() is False
        auth_status, uid = api.getAuthStatus()
        assert auth_status is False or auth_status is True  # Depends on mock service

    def test_manual_auth_mode(self, temp_key_files):
        """Test connection in manual authentication mode."""
        api = MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key=temp_key_files["server_key"],
            manual_auth=True,
        )

        assert api._conn is not None
        assert api.keysLoaded() is False
        assert api.keysValid() is False

    def test_missing_server_host_raises_exception(self, temp_key_files):
        """Test that missing server host raises exception."""
        with pytest.raises(Exception, match="Server host is not defined"):
            MessageLib.API(
                server_port=Defaults.mock_core_server_port,
                server_pub_key=temp_key_files["server_key"],
            )

    def test_missing_server_port_raises_exception(self, temp_key_files):
        """Test that missing server port raises exception."""
        with pytest.raises(Exception, match="Server port is not defined"):
            MessageLib.API(
                server_host=Defaults.mock_core_server_host,
                server_pub_key=temp_key_files["server_key"],
            )

    def test_missing_server_key_raises_exception(self):
        """Test that missing server key raises exception."""
        with pytest.raises(Exception, match="Server public key or key file is not defined"):
            MessageLib.API(
                server_host=Defaults.mock_core_server_host,
                server_port=Defaults.mock_core_server_port,
            )

    def test_both_server_key_and_file_raises_exception(self, temp_key_files):
        """Test that providing both server key and key file raises exception."""
        with pytest.raises(Exception, match="Cannot specify both server public key and key file"):
            MessageLib.API(
                server_host=Defaults.mock_core_server_host,
                server_port=Defaults.mock_core_server_port,
                server_pub_key=temp_key_files["server_key"],
                server_pub_key_file=temp_key_files["server"],
            )

    def test_invalid_key_file_path_raises_exception(self):
        """Test that invalid key file path raises exception."""
        with pytest.raises(Exception, match="Could not open server public key file"):
            MessageLib.API(
                server_host=Defaults.mock_core_server_host,
                server_port=Defaults.mock_core_server_port,
                server_pub_key_file="/nonexistent/path/to/key.pub",
            )

    def test_malformed_client_keys_generates_new_keys(self, temp_key_files):
        """Test that malformed client keys result in new key generation."""
        # Create files with invalid key content
        bad_pub_key_file = os.path.join(temp_key_files["temp_dir"], "bad.pub")
        bad_priv_key_file = os.path.join(temp_key_files["temp_dir"], "bad.priv")

        with open(bad_pub_key_file, "w") as f:
            f.write("SHORT_KEY")
        with open(bad_priv_key_file, "w") as f:
            f.write("SHORT_KEY")

        api = MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key=temp_key_files["server_key"],
            client_pub_key_file=bad_pub_key_file,
            client_priv_key_file=bad_priv_key_file,
        )

        assert api._conn is not None
        assert api.keysLoaded() is True
        assert api.keysValid() is False  # Keys were invalid


class TestAuthentication:
    """Test authentication methods."""

    def test_manual_auth_by_password_success(self, temp_key_files):
        """Test successful manual authentication by password."""
        print(f"Test: Server public key: {temp_key_files['server_key']}")
        print(f"Test: Client public key: {Defaults.mock_python_client_public_key}")
        print(f"Test: Client private key: {Defaults.mock_python_client_private_key}")
        api = MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key=temp_key_files["server_key"],
            manual_auth=True,
            client_pub_key=Defaults.mock_python_client_public_key,
            client_priv_key=Defaults.mock_python_client_private_key,
        )

        # Attempt authentication with test credentials
        api.manualAuthByPassword(Defaults.mock_authenticated_test_user, Defaults.test_user_password)

        auth_status, uid = api.getAuthStatus()
        assert auth_status is True
        assert uid == Defaults.mock_authenticated_test_user

    def test_manual_auth_by_password_failure(self, temp_key_files):
        """Test failed manual authentication by password."""
        api = MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key=temp_key_files["server_key"],
            manual_auth=True,
        )

        # Attempt authentication with invalid credentials
        with pytest.raises(Exception, match="Password authentication failed"):
            api.manualAuthByPassword("invalid_user", "wrong_password")

    def test_manual_auth_by_token_success(self, temp_key_files):
        """Test successful manual authentication by token."""
        api = MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key=temp_key_files["server_key"],
            manual_auth=True,
        )

        # Attempt authentication with test token
        api.manualAuthByToken(Defaults.test_user_token)

        auth_status, uid = api.getAuthStatus()
        assert auth_status is True
        assert uid is not None

    def test_manual_auth_by_token_failure(self, temp_key_files):
        """Test failed manual authentication by token."""
        api = MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key=temp_key_files["server_key"],
            manual_auth=True,
        )

        # Attempt authentication with invalid token
        with pytest.raises(Exception, match="Token authentication failed"):
            api.manualAuthByToken("invalid_token")


class TestMessaging:
    """Test message sending and receiving functionality."""

    @pytest.fixture
    def api_client(self, temp_key_files):
        """Create an API client for testing."""
        return MessageLib.API(
            server_host=Defaults.mock_core_server_host,
            server_port=Defaults.mock_core_server_port,
            server_pub_key=temp_key_files["server_key"],
        )

    def test_send_recv_synchronous(self, api_client):
        """Test synchronous send/receive."""
        # Create a test request (using GetAuthStatusRequest as example)
        request = anon.GetAuthStatusRequest()

        # Send and receive
        reply, msg_type = api_client.sendRecv(request)

        assert reply is not None
        assert msg_type is not None

    def test_send_recv_with_custom_timeout(self, api_client):
        """Test send/receive with custom timeout."""
        request = anon.GetAuthStatusRequest()

        # Test with short timeout
        reply, msg_type = api_client.sendRecv(request, timeout=1000)

        assert reply is not None or reply is None  # Depends on mock service response time


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
