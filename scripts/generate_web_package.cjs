#!/usr/bin/env node
"use strict";

// CMake supplies version-expanded application metadata as JSON. Dependency
// sections come exclusively from DataFedDependencies; no packages are loaded.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const dependencyFields = [
    "dependencies", "devDependencies", "overrides", "optionalDependencies",
    "peerDependencies", "peerDependenciesMeta", "bundledDependencies", "bundleDependencies",
];

function object(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be a JSON object`);
    }
}

function generate(metadataJson, dependencyFile, outputFile) {
    const metadata = JSON.parse(metadataJson);
    const canonical = JSON.parse(fs.readFileSync(dependencyFile, "utf8"));
    object(metadata, "Application metadata");
    object(canonical, "Dependency manifest");
    object(canonical.dependencies, "Dependency manifest dependencies");

    const manifest = { ...metadata };
    for (const field of dependencyFields) {
        if (Object.hasOwn(metadata, field)) {
            throw new Error(`Application metadata must not declare ${field}; edit ${dependencyFile}`);
        }
        if (Object.hasOwn(canonical, field)) {
            if (field === "bundledDependencies" || field === "bundleDependencies") {
                if (!Array.isArray(canonical[field]) || canonical[field].some(name => typeof name !== "string")) {
                    throw new Error(`${field} must be an array of package names`);
                }
            } else {
                object(canonical[field], `Dependency manifest ${field}`);
            }
            manifest[field] = canonical[field];
        }
    }

    const content = JSON.stringify(manifest, null, 2) + "\n";
    // Avoid needless rebuilds, and preserve the previous manifest on failure.
    if (fs.existsSync(outputFile) && fs.readFileSync(outputFile, "utf8") === content) {
        return;
    }
    const temporary = path.join(path.dirname(outputFile),
        `.package-${process.pid}-${crypto.randomBytes(6).toString("hex")}.tmp`);
    try {
        fs.writeFileSync(temporary, content, { flag: "wx" });
        fs.renameSync(temporary, outputFile);
    } finally {
        try {
            fs.unlinkSync(temporary);
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }
}

if (require.main === module) {
    try {
        if (process.argv.length !== 5) {
            throw new Error("Usage: generate_web_package.cjs '<metadata JSON>' dependency-manifest output-file");
        }
        generate(...process.argv.slice(2));
    } catch (error) {
        console.error(`Web package generation failed: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = { generate };
