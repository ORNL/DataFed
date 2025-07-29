"use strict";

const { RepositoryType } = require("../api/repository/types");

const ValidationTestCases = {
    paths: [
        { input: "/data/repo", expected: true, description: "valid absolute path" },
        { input: "/data/repo/", expected: true, description: "valid path with trailing slash" },
        {
            input: "data/repo",
            expected: false,
            description: "relative path",
            error: "absolute path",
        },
        {
            input: "/data/../repo",
            expected: false,
            description: "path traversal",
            error: "invalid path sequences",
        },
        {
            input: "/data//repo",
            expected: false,
            description: "double slash",
            error: "invalid path sequences",
        },
        {
            input: "/data/repo/../other",
            expected: false,
            description: "complex traversal",
            error: "invalid path sequences",
        },
    ],

    capacities: [
        { input: 1000000, expected: true, description: "valid capacity" },
        { input: 1, expected: true, description: "minimum valid capacity" },
        { input: Number.MAX_SAFE_INTEGER, expected: true, description: "maximum safe integer" },
        { input: 0, expected: false, description: "zero capacity", error: "positive number" },
        {
            input: -100,
            expected: false,
            description: "negative capacity",
            error: "positive number",
        },
        {
            input: "not a number",
            expected: false,
            description: "string capacity",
            error: "positive number",
        },
        { input: null, expected: false, description: "null capacity", error: "positive number" },
    ],

    strings: [
        { input: "valid string", expected: true, description: "normal string" },
        { input: "a", expected: true, description: "single character" },
        { input: "", expected: false, description: "empty string", error: "required" },
        { input: "   ", expected: false, description: "whitespace only", error: "required" },
        { input: null, expected: false, description: "null value", error: "required" },
        { input: undefined, expected: false, description: "undefined value", error: "required" },
    ],

    repositoryTypes: [
        { input: RepositoryType.GLOBUS, expected: true, description: "valid Globus type" },
        { input: RepositoryType.METADATA_ONLY, expected: true, description: "valid metadata type" },
        {
            input: "unknown_type",
            expected: false,
            description: "unknown type",
            error: "Unknown repository type",
        },
        {
            input: null,
            expected: false,
            description: "null type",
            error: "Unknown repository type",
        },
        { input: "", expected: false, description: "empty type", error: "Unknown repository type" },
    ],
};

const RepositoryTestData = {
    globusConfigs: [
        {
            name: "complete_globus",
            config: {
                id: "test_globus",
                type: RepositoryType.GLOBUS,
                title: "Test Globus Repository",
                capacity: 1000000000,
                admins: ["u/admin1"],
                pub_key: "ssh-rsa test-key",
                address: "test.server.org",
                endpoint: "test-endpoint",
                path: "/data/test_globus",
                domain: "test.org",
            },
            valid: true,
        },
        {
            name: "missing_pub_key",
            config: {
                id: "test_globus_no_key",
                type: RepositoryType.GLOBUS,
                title: "Test Globus No Key",
                capacity: 1000000000,
                admins: ["u/admin1"],
                address: "test.server.org",
                endpoint: "test-endpoint",
                path: "/data/test_globus_no_key",
                domain: "test.org",
            },
            valid: false,
            error: "Public key",
        },
        {
            name: "invalid_path",
            config: {
                id: "test_globus_bad_path",
                type: RepositoryType.GLOBUS,
                title: "Test Globus Bad Path",
                capacity: 1000000000,
                admins: ["u/admin1"],
                pub_key: "ssh-rsa test-key",
                address: "test.server.org",
                endpoint: "test-endpoint",
                path: "relative/path",
                domain: "test.org",
            },
            valid: false,
            error: "absolute path",
        },
    ],

    metadataConfigs: [
        {
            name: "complete_metadata",
            config: {
                id: "test_metadata",
                type: RepositoryType.METADATA_ONLY,
                title: "Test Metadata Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
            },
            valid: true,
        },
        {
            name: "metadata_with_globus_fields",
            config: {
                id: "test_metadata_invalid",
                type: RepositoryType.METADATA_ONLY,
                title: "Test Metadata Invalid",
                capacity: 1000000,
                admins: ["u/admin1"],
                pub_key: "should-not-be-here",
            },
            valid: false,
            error: "should not have",
        },
        {
            name: "empty_admins",
            config: {
                id: "test_metadata_no_admin",
                type: RepositoryType.METADATA_ONLY,
                title: "Test Metadata No Admin",
                capacity: 1000000,
                admins: [],
            },
            valid: false,
            error: "at least one admin",
        },
    ],
};

const runParameterizedTest = (testCases, testFunction) => {
    testCases.forEach((testCase) => {
        it(testCase.description || testCase.name, () => {
            testFunction(testCase);
        });
    });
};

module.exports = {
    ValidationTestCases,
    RepositoryTestData,
    runParameterizedTest,
};
