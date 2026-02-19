"use strict";

const { RepositoryType } = require("./types");
const g_db = require("@arangodb").db;
const { validateNonEmptyString } = require("./validation");
const error = require("../../lib/error_codes");
const { Result } = require("../../lib/result");

const createRepositoryData = ({
    key,
    type,
    title,
    desc,
    capacity,
    // Type-specific fields handled through composition
    typeSpecific = {},
}) => ({
    key: key,
    id: `repo/${key}`,
    type,
    title,
    desc,
    capacity,
    ...typeSpecific,
});

// WARNING - this will completely replace arrays
function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
            if (!target[key] || typeof target[key] !== "object") {
                target[key] = {};
            }
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

class BaseRepository {
    constructor(config, typeSpecificConfig) {
        if (new.target === BaseRepository) {
            return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: "BaseRepository cannot be instantiated directly",
            });
        }

        let new_repo_data = createRepositoryData({
            key: config.key,
            type: config.type,
            title: config.title,
            desc: config.desc,
            capacity: config.capacity,
            typeSpecific: typeSpecificConfig,
        });

        let id_defined = false;
        if (config.id !== undefined) {
            if (config.id.startsWith("repo/") && config.id.length > "repo/".length) {
                id_defined = true;
            }
        }

        let key_defined = false;
        if (config.key !== undefined) {
            key_defined = true;
        }

        if (key_defined && id_defined) {
            if (config.id !== `repo/${config.key}`) {
                return Result.err({
                    code: error.ERR_INVALID_PARAM,
                    message: `BaseRepository - provided key ${config.key} is in conflict with id ${config.id}.`,
                });
            }
        }

        if (key_defined) {
            config.id = `repo/${config.key}`;
        } else if (id_defined) {
            config.key = config.id.slice("repo/".length);
        }

        // If we have a key we assume the repo exists
        if (config.key != undefined) {
            try {
                if (g_db._exists(config.id)) {
                    const existingDoc = g_db.repo.document(config.key);
                    const { _id, _key, _rev, ...temp } = existingDoc;
                    this.repoData = {
                        id: existingDoc._id,
                        key: existingDoc._key,
                        ...temp,
                    };
                    this.repoData = deepMerge(this.repoData, new_repo_data);
                } else {
                    this.repoData = new_repo_data;
                }
            } catch {
                return Result.err({
                    code: error.ERR_INVALID_PARAM,
                    message: `BaseRepository - unable to create repository instance ${config.key}.`,
                });
            }
        } else {
            this.repoData = { ...new_repo_data, id: `repo/${config.key}`, key: config.key };
        }

        return Result.ok(this);
    }

    id() {
        return this.repoData.id;
    }

    // Validate repository configuration
    static validate(config) {
        return Result.err({
            code: error.ERR_INVALID_OPERATION,
            message: `BaseRepository - unimplemented validation method called.`,
        });
    }

    // Create allocation for repository
    createAllocation(allocationParams) {
        return Result.err({
            code: error.ERR_INVALID_OPERATION,
            message: `BaseRepository - unimplemented createAllocation method called.`,
        });
    }

    // Delete allocation from repository
    deleteAllocation(subjectId) {
        return Result.ok(this.repoData.capacity);
    }

    // Check if repository supports data operations
    supportsDataOperations() {
        return Result.err({
            code: error.ERR_INVALID_OPERATION,
            message: `BaseRepository - unimplemented supportsDataOperations method called.`,
        });
    }

    // Return repository type
    type() {
        return Result.err({
            code: error.ERR_INTERNAL_FAULT,
            message: `BaseRepository - unimplemented type method called.`,
        });
    }

    capacity() {
        return this.repoData?.capacity;
    }

    // Save repository to database
    save() {
        try {
            const { id, key, ...repo_data } = this.repoData;
            if (key != undefined) {
                if (g_db._exists(id)) {
                    const updated = g_db.repo.update(
                        { _key: key, ...repo_data },
                        { returnNew: true },
                    );
                    const { _id, _key, _rev, ...updated_repo_data } = updated.new;
                    this.repoData = { id: _id, key: _key, ...updated_repo_data };
                    return Result.ok(updated.new);
                } else {
                    const saved = g_db.repo.save({ _key: key, ...repo_data }, { returnNew: true });
                    const { _id, _key, _rev, ...saved_repo_data } = saved.new;
                    this.repoData = { id: _id, key: _key, ...saved_repo_data };
                    return Result.ok(saved.new);
                }
            } else {
                const saved = g_db.repo.save(repo_data, { returnNew: true });
                const { _id, _key, _rev, ...saved_repo_data } = saved.new;
                this.repoData = { id: _id, key: _key, ...saved_repo_data };
                return Result.ok(saved.new);
            }
        } catch (e) {
            return Result.err({
                code: e.errorNum || 500,
                message: e.errorMessage || "Failed to save repository",
            });
        }
    }

    // Update repository in database
    update(updates) {
        try {
            // Lazy migration: ensure type field exists when updating
            // If the repository doesn't have a type, add it based on current state
            if (!this.repoData.type && !updates.type) {
                updates.type = this.repoData.type || RepositoryType.GLOBUS;
            }

            if (g_db._exists(this.repoData.id)) {
                const updated = g_db.repo.update(this.repoData.key, updates, { returnNew: true });
                const { _id, _key, _rev, ...updated_repo_data } = updated.new;
                this.repoData = { id: _id, key: _key, ...updated_repo_data };
                return Result.ok(updated.new);
            }
            return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `Failed to update repository, repository document was not found (${this.repoData.id})`,
            });
        } catch (e) {
            return Result.err({
                code: e.errorNum || 500,
                message: e.errorMessage || "Failed to update repository",
            });
        }
    }
}

module.exports = { BaseRepository };
