#!/usr/bin/env python3
# WARNING - to work with python environments we cannot use /bin/python3 or
#           a hardcoded abs path.
import json
import os
import sys
import time
import unittest


class TestDataFedPythonAPISchemaCRUD(unittest.TestCase):
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

        self._timeout = int(os.environ.get('DATAFED_TEST_TIMEOUT_OVERRIDE', '1'))
        count = 0
        while True:
            try:
                self._df_api.loginByPassword(self._username, password)
                break
            except BaseException:
                pass
            count += 1
            assert count < 3

        # Base JSON Schema definition reused across tests
        self._base_schema_def = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "value": {"type": "number"},
                "tags": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["name", "value"]
        }

        # Base LinkML schema definition reused across LinkML tests
        self._base_linkml_def = (
            "id: https://example.org/test-schema\n"
            "name: test_schema\n"
            "prefixes:\n"
            "  linkml: https://w3id.org/linkml/\n"
            "  test_schema: https://example.org/test-schema/\n"
            "imports:\n"
            "  - linkml:types\n"
            "default_range: string\n"
            "default_prefix: test_schema\n"
            "\n"
            "classes:\n"
            "  Experiment:\n"
            "    attributes:\n"
            "      id:\n"
            "        required: true\n"
            "      name:\n"
            "        required: true\n"
            "      description:\n"
            "      sample_count:\n"
            "        range: integer\n"
            "      tags:\n"
            "        multivalued: true\n"
        )

        self._updated_linkml_def = (
            "id: https://example.org/test-schema\n"
            "name: test_schema\n"
            "prefixes:\n"
            "  linkml: https://w3id.org/linkml/\n"
            "  test_schema: https://example.org/test-schema/\n"
            "imports:\n"
            "  - linkml:types\n"
            "default_range: string\n"
            "default_prefix: test_schema\n"
            "\n"
            "classes:\n"
            "  Experiment:\n"
            "    attributes:\n"
            "      id:\n"
            "        required: true\n"
            "      name:\n"
            "        required: true\n"
            "      description:\n"
            "      sample_count:\n"
            "        range: integer\n"
            "      unit:\n"
            "      tags:\n"
            "        multivalued: true\n"
        )

    # =========================================================================
    # JSON Schema Tests
    # =========================================================================

    def test_schema_create_view_delete(self):
        """Test basic schema lifecycle: create, view, delete."""

        schema_name = "test_basic_schema"
        definition = json.dumps(self._base_schema_def)

        # Create
        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=definition,
            description="Basic test schema",
        )
        schema_id = create_result[0].schema[0].id
        self.assertEqual(create_result[1], "SchemaDataReply")

        # View
        view_result = self._df_api.schemaView(schema_id)
        self.assertEqual(view_result[1], "SchemaDataReply")
        self.assertTrue(len(view_result[0].schema) > 0)

        schema_data = view_result[0].schema[0]
        self.assertEqual(schema_data.id, schema_id)
        self.assertEqual(schema_data.desc, "Basic test schema")

        returned_def = json.loads(getattr(schema_data, 'def'))
        self.assertEqual(returned_def["type"], "object")
        self.assertIn("name", returned_def["properties"])

        # Delete
        delete_result = self._df_api.schemaDelete(schema_id)
        self.assertEqual(delete_result[1], "AckReply")

        # Verify deleted — view should fail
        with self.assertRaises(Exception):
            self._df_api.schemaView(schema_id)

    def test_schema_create_with_invalid_json(self):
        """Client-side validation should reject malformed JSON."""

        with self.assertRaises(Exception) as ctx:
            self._df_api.schemaCreate(
                "test_bad_json",
                definition="{not valid json",
                description="test bad schema"
            )

        self.assertIn("not valid JSON", str(ctx.exception))

    def test_schema_create_missing_definition(self):
        """Must provide either definition or definition_file."""

        with self.assertRaises(Exception) as ctx:
            self._df_api.schemaCreate(
                    "test_no_def",
                    description="test bad schema"
                )
        self.assertIn("Must specify", str(ctx.exception))

    def test_schema_create_both_definition_sources(self):
        """Cannot specify both definition and definition_file."""

        with self.assertRaises(Exception) as ctx:
            self._df_api.schemaCreate(
                "test_both_def",
                definition='{"type": "object", "properties": {}}',
                definition_file="/tmp/fake.json",
            )

        self.assertIn("Cannot specify both", str(ctx.exception))

    def test_schema_update_both_definition_sources(self):
        """Cannot specify both definition and definition_file for schemaUpdate."""

        with self.assertRaises(Exception) as ctx:
            self._df_api.schemaUpdate(
                "test_update_both_def",
                definition='{"type": "object", "properties": {}}',
                definition_file="/tmp/fake.json",
            )

        self.assertIn("Cannot specify both", str(ctx.exception))

    def test_schema_revise_both_definition_sources(self):
        """Cannot specify both definition and definition_file for schemaRevise."""

        with self.assertRaises(Exception) as ctx:
            self._df_api.schemaRevise(
                "test_revise_both_def",
                definition='{"type": "object", "properties": {}}',
                definition_file="/tmp/fake.json",
            )

        self.assertIn("Cannot specify both", str(ctx.exception))

    def test_schema_update(self):
        """Test updating a schema in place."""

        schema_name = "test_update_schema"
        definition = json.dumps(self._base_schema_def)

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=definition,
            description="Before update",
        )

        schema_id = create_result[0].schema[0].id
        # Update description
        self._df_api.schemaUpdate(
            schema_id,
            description="After update",
        )

        view_result = self._df_api.schemaView(schema_id)
        self.assertEqual(view_result[0].schema[0].desc, "After update")

        # Update definition
        updated_def = self._base_schema_def.copy()
        updated_def["properties"]["new_field"] = {"type": "string"}

        self._df_api.schemaUpdate(
            schema_id,
            definition=json.dumps(updated_def),
        )

        view_result = self._df_api.schemaView(schema_id)
        returned_def = json.loads(getattr(view_result[0].schema[0], 'def'))
        self.assertIn("new_field", returned_def["properties"])

        # Rename
        new_id = "test_update_schema_renamed:0"
        self._df_api.schemaUpdate(schema_id, new_id=new_id)

        view_result = self._df_api.schemaView(new_id)
        self.assertEqual(view_result[0].schema[0].id, new_id)

        # Old ID should fail
        with self.assertRaises(Exception):
            self._df_api.schemaView(schema_id)

        # Cleanup
        self._df_api.schemaDelete(new_id)

    def test_schema_revise(self):
        """Test creating a new revision of a schema."""

        schema_name = "test_revise_schema"
        definition = json.dumps(self._base_schema_def)

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=definition,
            description="Revision 1",
        )

        schema_id = create_result[0].schema[0].id
        view_v1 = self._df_api.schemaView(schema_id)
        ver_1 = view_v1[0].schema[0].ver

        # Revise with updated definition
        revised_def = self._base_schema_def.copy()
        revised_def["properties"]["revision_field"] = {"type": "boolean"}

        create_result = self._df_api.schemaRevise(
            schema_id,
            definition=json.dumps(revised_def),
            description="Revision 2",
        )
        schema_id2 = create_result[0].schema[0].id

        view_v2 = self._df_api.schemaView(schema_id2)
        ver_2 = view_v2[0].schema[0].ver

        self.assertGreater(ver_2, ver_1)
        self.assertEqual(view_v2[0].schema[0].desc, "Revision 2")

        returned_def = json.loads(getattr(view_v2[0].schema[0], 'def'))
        self.assertIn("revision_field", returned_def["properties"])

        # Cleanup
        self._df_api.schemaDelete(schema_id)
        self._df_api.schemaDelete(schema_id2)

    def test_schema_search(self):
        """Test schema search functionality."""

        prefix = "test_search_schema"
        schemas_to_cleanup = []

        for i in range(3):
            s_name = "{}_{}".format(prefix, i)
            create_result = self._df_api.schemaCreate(
                s_name,
                definition=json.dumps(self._base_schema_def),
                description="Searchable schema number {}".format(i),
            )
            schema_id = create_result[0].schema[0].id
            schemas_to_cleanup.append(schema_id)

        # Search by ID prefix
        search_result = self._df_api.schemaSearch(schema_id=prefix)

        def wait_for_search(prefix, expected, timeout=10):
            start = time.time()
            while time.time() - start < timeout:
                res = self._df_api.schemaSearch(schema_id=prefix)
                if len(res[0].schema) >= expected:
                    return res
                time.sleep(0.5)
            return res

        search_result = wait_for_search(prefix, 3, timeout=10)

        print("reply type:", search_result[1])
        print("num schemas:", len(search_result[0].schema))

        for s in search_result[0].schema:
            # s fields depend on the protobuf, but these are commonly present:
            print("id:", getattr(s, "id", None),
                  "ver:", getattr(s, "ver", None),
                  "owner:", getattr(s, "owner", None),
                  "desc:", getattr(s, "desc", None))

        self.assertEqual(search_result[1], "SchemaDataReply")
        self.assertGreaterEqual(len(search_result[0].schema), 3)

        # Search by text in description
        search_result = self._df_api.schemaSearch(text="Searchable schema")
        self.assertGreaterEqual(len(search_result[0].schema), 3)

        # Search with pagination
        search_result = self._df_api.schemaSearch(
            schema_id=prefix, offset=0, count=2
        )
        self.assertLessEqual(len(search_result[0].schema), 2)

        # Search by owner
        search_result = self._df_api.schemaSearch(
            schema_id=prefix, owner="u/" + self._username
        )
        self.assertGreaterEqual(len(search_result[0].schema), 3)

        # Cleanup
        for sid in schemas_to_cleanup:
            self._df_api.schemaDelete(sid)

    def test_schema_public_flag(self):
        """Test creating a public schema."""

        schema_name = "test_public_schema"
        definition = json.dumps(self._base_schema_def)

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=definition,
            description="Public schema test",
            public=True,
        )

        schema_id = create_result[0].schema[0].id
        view_result = self._df_api.schemaView(schema_id)
        self.assertTrue(view_result[0].schema[0].pub)

        # Cleanup
        self._df_api.schemaDelete(schema_id)

    def test_metadata_validate_pass(self):
        """Test metadata validation with valid metadata."""

        schema_name = "test_validate_schema"
        definition = json.dumps(self._base_schema_def)

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=definition,
            description="test bad schema"
        )
        schema_id = create_result[0].schema[0].id

        valid_metadata = json.dumps({
            "name": "widget",
            "value": 42.0,
            "tags": ["alpha", "beta"]
        })

        result = self._df_api.metadataValidate(schema_id, metadata=valid_metadata)
        self.assertFalse(result[0].errors)

        # Cleanup
        self._df_api.schemaDelete(schema_id)

    def test_metadata_validate_fail(self):
        """Test metadata validation with invalid metadata."""

        schema_name = "test_validate_fail_schema"
        definition = json.dumps(self._base_schema_def)

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=definition,
            description="test bad schema"
        )
        schema_id = create_result[0].schema[0].id

        # Missing required "name" field, wrong type for "value"
        invalid_metadata = json.dumps({
            "value": "not_a_number"
        })

        result = self._df_api.metadataValidate(schema_id, metadata=invalid_metadata)
        self.assertTrue(result[0].errors)

        # Cleanup
        self._df_api.schemaDelete(schema_id)

    def test_metadata_validate_client_rejects_bad_json(self):
        """Client should reject invalid JSON before sending to server."""

        with self.assertRaises(Exception) as ctx:
            self._df_api.metadataValidate(
                "any_schema",
                metadata="{bad json",
            )

        self.assertIn("not valid JSON", str(ctx.exception))

    def test_metadata_validate_requires_input(self):
        """Must provide metadata or metadata_file."""

        with self.assertRaises(Exception) as ctx:
            self._df_api.metadataValidate("any_schema")

        self.assertIn("Must specify", str(ctx.exception))

    def test_metadata_validate_metadata_file_cannot_be_opened(self):
        """metadata_file set but file cannot be opened should raise expected error."""

        bad_path = "/path/does/not/exist"

        with self.assertRaises(Exception) as ctx:
            self._df_api.metadataValidate("any_schema", metadata_file=bad_path)

        # The client should surface a clear file-open error that includes the path.
        self.assertIn("Could not open metadata file:", str(ctx.exception))
        self.assertIn(bad_path, str(ctx.exception))

    def test_schema_create_from_file(self):
        """Test creating a schema from a definition file."""

        schema_name = "test_file_schema"
        tmp_file = "/tmp/test_schema_def.json"

        try:
            with open(tmp_file, "w") as f:
                json.dump(self._base_schema_def, f)

            create_result = self._df_api.schemaCreate(
                schema_name,
                definition_file=tmp_file,
                description="Created from file",
            )
            schema_id = create_result[0].schema[0].id
            self.assertEqual(create_result[1], "SchemaDataReply")

            view_result = self._df_api.schemaView(schema_id)
            returned_def = json.loads(getattr(view_result[0].schema[0], 'def'))
            self.assertEqual(returned_def["type"], "object")

            self._df_api.schemaDelete(schema_id)
        finally:
            if os.path.exists(tmp_file):
                os.remove(tmp_file)

    # =========================================================================
    # LinkML Schema Tests
    #
    # These tests require the SchemaDBApi service to be running and the
    # DataFed core server configured with a linkml schema engine.
    #
    # The Python API must support schema_type and schema_format parameters
    # on schemaCreate, schemaUpdate, and schemaRevise. If these parameters
    # are not yet supported, these tests will need to be updated once they
    # are added to the Python client.
    # =========================================================================

    def test_linkml_schema_create_view_delete(self):
        """Test basic LinkML schema lifecycle: create, view, delete."""

        schema_name = "test_linkml_basic"

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=self._base_linkml_def,
            description="Basic LinkML test schema",
            schema_type="linkml",
            schema_format="yaml",
        )
        schema_id = create_result[0].schema[0].id
        self.assertEqual(create_result[1], "SchemaDataReply")

        # View — content should be hydrated from external storage
        view_result = self._df_api.schemaView(schema_id)
        self.assertEqual(view_result[1], "SchemaDataReply")
        self.assertTrue(len(view_result[0].schema) > 0)

        schema_data = view_result[0].schema[0]
        self.assertEqual(schema_data.id, schema_id)
        self.assertEqual(schema_data.desc, "Basic LinkML test schema")

        returned_def = getattr(schema_data, 'def')
        self.assertIn("Experiment", returned_def)
        self.assertIn("sample_count", returned_def)
        self.assertIn("linkml:types", returned_def)

        # Delete
        delete_result = self._df_api.schemaDelete(schema_id)
        self.assertEqual(delete_result[1], "AckReply")

        # Verify deleted
        with self.assertRaises(Exception):
            self._df_api.schemaView(schema_id)

    def test_linkml_schema_create_invalid_yaml(self):
        """Server should reject invalid YAML as a LinkML schema."""

        invalid_yaml = "  not: valid: yaml: {{{{\n  - [unterminated\n"

        with self.assertRaises(Exception):
            self._df_api.schemaCreate(
                "test_linkml_bad_yaml",
                definition=invalid_yaml,
                description="Should fail",
                schema_type="linkml",
                schema_format="yaml",
            )

    def test_linkml_schema_update_description(self):
        """Test updating a LinkML schema description in place."""

        schema_name = "test_linkml_update"

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=self._base_linkml_def,
            description="Before update",
            schema_type="linkml",
            schema_format="yaml",
        )
        schema_id = create_result[0].schema[0].id

        self._df_api.schemaUpdate(
            schema_id,
            description="After update",
        )

        view_result = self._df_api.schemaView(schema_id)
        self.assertEqual(view_result[0].schema[0].desc, "After update")

        # Cleanup
        self._df_api.schemaDelete(schema_id)

    def test_linkml_schema_update_definition(self):
        """Test updating a LinkML schema definition in place."""

        schema_name = "test_linkml_update_def"

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=self._base_linkml_def,
            description="Original def",
            schema_type="linkml",
            schema_format="yaml",
        )
        schema_id = create_result[0].schema[0].id

        self._df_api.schemaUpdate(
            schema_id,
            definition=self._updated_linkml_def,
        )

        view_result = self._df_api.schemaView(schema_id)
        returned_def = getattr(view_result[0].schema[0], 'def')
        self.assertIn("unit", returned_def)

        # Cleanup
        self._df_api.schemaDelete(schema_id)

    def test_linkml_schema_revise(self):
        """Test creating a new revision of a LinkML schema."""

        schema_name = "test_linkml_revise"

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=self._base_linkml_def,
            description="LinkML Revision 1",
            schema_type="linkml",
            schema_format="yaml",
        )
        schema_id = create_result[0].schema[0].id
        view_v1 = self._df_api.schemaView(schema_id)
        ver_1 = view_v1[0].schema[0].ver

        # Revise with updated definition
        revise_result = self._df_api.schemaRevise(
            schema_id,
            definition=self._updated_linkml_def,
            description="LinkML Revision 2",
        )
        schema_id2 = revise_result[0].schema[0].id

        view_v2 = self._df_api.schemaView(schema_id2)
        ver_2 = view_v2[0].schema[0].ver

        self.assertGreater(ver_2, ver_1)
        self.assertEqual(view_v2[0].schema[0].desc, "LinkML Revision 2")

        returned_def = getattr(view_v2[0].schema[0], 'def')
        self.assertIn("unit", returned_def)

        # Cleanup
        self._df_api.schemaDelete(schema_id)
        self._df_api.schemaDelete(schema_id2)

    def test_linkml_schema_search(self):
        """Test schema search finds LinkML schemas."""

        prefix = "test_linkml_search"
        schemas_to_cleanup = []

        for i in range(2):
            s_name = "{}_{}".format(prefix, i)
            create_result = self._df_api.schemaCreate(
                s_name,
                definition=self._base_linkml_def,
                description="LinkML searchable {}".format(i),
                schema_type="linkml",
                schema_format="yaml",
            )
            schema_id = create_result[0].schema[0].id
            schemas_to_cleanup.append(schema_id)

        def wait_for_search(prefix, expected, timeout=10):
            start = time.time()
            while time.time() - start < timeout:
                res = self._df_api.schemaSearch(schema_id=prefix)
                if len(res[0].schema) >= expected:
                    return res
                time.sleep(0.5)
            return res

        search_result = wait_for_search(prefix, 2, timeout=10)

        self.assertEqual(search_result[1], "SchemaDataReply")
        self.assertGreaterEqual(len(search_result[0].schema), 2)

        # Cleanup
        for sid in schemas_to_cleanup:
            self._df_api.schemaDelete(sid)

    def test_linkml_metadata_validate_pass(self):
        """Test metadata validation passes with valid data against a LinkML schema."""

        schema_name = "test_linkml_validate_pass"

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=self._base_linkml_def,
            description="LinkML validation test",
            schema_type="linkml",
            schema_format="yaml",
        )
        schema_id = create_result[0].schema[0].id

        valid_metadata = json.dumps({
            "id": "exp001",
            "name": "trial run",
            "description": "initial experiment",
            "sample_count": 5,
            "tags": ["alpha", "beta"]
        })

        result = self._df_api.metadataValidate(schema_id, metadata=valid_metadata)
        self.assertFalse(result[0].errors)

        # Cleanup
        self._df_api.schemaDelete(schema_id)

    def test_linkml_metadata_validate_missing_required(self):
        """Test metadata validation fails when required fields are missing."""

        schema_name = "test_linkml_validate_missing"

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=self._base_linkml_def,
            description="LinkML validation test",
            schema_type="linkml",
            schema_format="yaml",
        )
        schema_id = create_result[0].schema[0].id

        # Missing required "id" and "name" fields
        invalid_metadata = json.dumps({
            "sample_count": 5
        })

        result = self._df_api.metadataValidate(schema_id, metadata=invalid_metadata)
        self.assertTrue(result[0].errors)
        self.assertIn("required", result[0].errors.lower())

        # Cleanup
        self._df_api.schemaDelete(schema_id)

    def test_linkml_metadata_validate_wrong_type(self):
        """Test metadata validation fails when field types are wrong."""

        schema_name = "test_linkml_validate_type"

        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=self._base_linkml_def,
            description="LinkML type validation test",
            schema_type="linkml",
            schema_format="yaml",
        )
        schema_id = create_result[0].schema[0].id

        # sample_count should be integer, not string
        invalid_metadata = json.dumps({
            "id": "exp001",
            "name": "trial run",
            "sample_count": "not_a_number"
        })

        result = self._df_api.metadataValidate(schema_id, metadata=invalid_metadata)
        self.assertTrue(result[0].errors)

        # Cleanup
        self._df_api.schemaDelete(schema_id)

    def test_linkml_schema_create_from_file(self):
        """Test creating a LinkML schema from a definition file."""

        schema_name = "test_linkml_file_schema"
        tmp_file = "/tmp/test_linkml_def.yaml"

        try:
            with open(tmp_file, "w") as f:
                f.write(self._base_linkml_def)

            create_result = self._df_api.schemaCreate(
                schema_name,
                definition_file=tmp_file,
                description="Created from YAML file",
                schema_type="linkml",
                schema_format="yaml",
            )
            schema_id = create_result[0].schema[0].id
            self.assertEqual(create_result[1], "SchemaDataReply")

            view_result = self._df_api.schemaView(schema_id)
            returned_def = getattr(view_result[0].schema[0], 'def')
            self.assertIn("Experiment", returned_def)

            self._df_api.schemaDelete(schema_id)
        finally:
            if os.path.exists(tmp_file):
                os.remove(tmp_file)

    def test_linkml_full_lifecycle(self):
        """Test complete LinkML lifecycle: create, validate, update, revise, delete."""

        schema_name = "test_linkml_lifecycle"

        # 1. Create
        create_result = self._df_api.schemaCreate(
            schema_name,
            definition=self._base_linkml_def,
            description="Lifecycle v1",
            schema_type="linkml",
            schema_format="yaml",
        )
        schema_id = create_result[0].schema[0].id

        # 2. Validate good metadata
        valid_metadata = json.dumps({
            "id": "exp001",
            "name": "trial run",
            "description": "initial experiment",
            "sample_count": 5,
            "tags": ["alpha", "beta"]
        })
        result = self._df_api.metadataValidate(schema_id, metadata=valid_metadata)
        self.assertFalse(result[0].errors)

        # 3. Validate bad metadata
        invalid_metadata = json.dumps({"sample_count": 5})
        result = self._df_api.metadataValidate(schema_id, metadata=invalid_metadata)
        self.assertTrue(result[0].errors)

        # 4. Update description
        self._df_api.schemaUpdate(schema_id, description="Lifecycle v1 updated")

        view_result = self._df_api.schemaView(schema_id)
        self.assertEqual(view_result[0].schema[0].desc, "Lifecycle v1 updated")

        # 5. Revise with updated definition
        revise_result = self._df_api.schemaRevise(
            schema_id,
            definition=self._updated_linkml_def,
            description="Lifecycle v2",
        )
        schema_id2 = revise_result[0].schema[0].id

        # 6. Validate metadata against new revision — should still pass
        #    since we only added an optional "unit" field
        result = self._df_api.metadataValidate(schema_id2, metadata=valid_metadata)
        self.assertFalse(result[0].errors)

        # 7. View new revision — should have "unit" in def
        view_v2 = self._df_api.schemaView(schema_id2)
        returned_def = getattr(view_v2[0].schema[0], 'def')
        self.assertIn("unit", returned_def)

        # 8. Delete both
        self._df_api.schemaDelete(schema_id2)
        self._df_api.schemaDelete(schema_id)

        # 9. Verify both gone
        with self.assertRaises(Exception):
            self._df_api.schemaView(schema_id)
        with self.assertRaises(Exception):
            self._df_api.schemaView(schema_id2)

    def tearDown(self):
        # No shared resources to clean up — each test manages its own schemas.
        # This keeps tests independent and avoids masking failures in cleanup.
        pass


if __name__ == "__main__":
    suite = unittest.TestSuite()

    # JSON Schema tests — basic lifecycle first, then features, then validation, then edge cases
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_create_view_delete"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_create_with_invalid_json"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_create_missing_definition"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_create_both_definition_sources"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_update"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_revise"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_search"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_public_flag"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_metadata_validate_pass"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_metadata_validate_fail"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_metadata_validate_client_rejects_bad_json"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_metadata_validate_requires_input"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_create_from_file"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_metadata_validate_metadata_file_cannot_be_opened"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_update_both_definition_sources"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_schema_revise_both_definition_sources"))

    # LinkML Schema tests
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_schema_create_view_delete"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_schema_create_invalid_yaml"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_schema_update_description"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_schema_update_definition"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_schema_revise"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_schema_search"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_metadata_validate_pass"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_metadata_validate_missing_required"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_metadata_validate_wrong_type"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_schema_create_from_file"))
    suite.addTest(TestDataFedPythonAPISchemaCRUD("test_linkml_full_lifecycle"))

    runner = unittest.TextTestRunner()
    result = runner.run(suite)
    sys.exit(not result.wasSuccessful())
