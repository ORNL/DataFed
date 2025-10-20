"use strict";

const { Result, RepositoryType } = require("./types");
const g_db = require("@arangodb").db;
const { validateNonEmptyString } = require("./validation");
const error = require("../../lib/error_codes");

const createRepositoryData = ({
    key,
    type,
    title,
    desc,
    capacity,
    admins,
    // Type-specific fields handled through composition
    typeSpecific = {},
}) => ({
    key: key,
    id: `repo/${key}`,
    type,
    title,
    desc,
    capacity,
    admins,
    ...typeSpecific,
});

class BaseRepository {
    constructor(config, typeSpecificConfig) {
        if (new.target === BaseRepository) {
            return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: "BaseRepository cannot be instantiated directly",
            });
        }

        this.repoData = createRepositoryData({
            id: `repo/${config.key}`,
            key: config.key,
            type: config.type,
            title: config.title,
            desc: config.desc,
            capacity: config.capacity,
            admins: config.admins,
            typeSpecific: typeSpecificConfig,
        });

        return Result.ok(this);
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

    // Get repository capacity information
    getCapacityInfo() {
        return Result.err({
            code: error.ERR_INVALID_OPERATION,
            message: `BaseRepository - unimplemented getCapacity method called.`,
        });
    }

    // Save repository to database
    save() {
        try {
            const { id, ...repo_data } = this.repoData;
            const repo_data_key = { ...repo_data, _key: repo_data.key };
            const saved = g_db.repo.save(repo_data_key, { returnNew: true });
            return Result.ok(saved.new);
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
                this.repoData = updated.new;
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

    // Check repository permissions
    checkPermission(userId, permission) {
        console.log("INFO - ===== RepositoryOps.checkPermission =====");
        console.log("INFO - Repository ID:", this.repoData.id);
        console.log("INFO - User ID:", userId);
        console.log("INFO - Permission type:", permission);
        console.log("INFO - Repository data.admins:", this.repoData.admins);

        // Check if user is in admins array (if it exists)
        if (this.repoData.admins && this.repoData.admins.includes(userId)) {
            console.log("INFO - User found in repository.data.admins array");
            console.log("INFO - ===== checkPermission: GRANTED (admins array) =====");
            return Result.ok(true);
        }

        // Check for admin edge in the database
        let adminEdge;
        try {
            adminEdge = g_db.admin.firstExample({ _from: this.repoData.id, _to: userId });
        } catch (e) {
            adminEdge = null;
        }

        if (adminEdge) {
            console.log("INFO - Admin edge found from", this.repoData.id, "to", userId);
            console.log("INFO - ===== checkPermission: GRANTED (admin edge) =====");
            return Result.ok(true);
        }

        // Check if user is system admin
        const userDoc = g_db._document(userId);
        if (userDoc && userDoc.is_admin) {
            console.log("INFO - User is system admin (is_admin: true)");
            console.log("INFO - ===== checkPermission: GRANTED (system admin) =====");
            return Result.ok(true);
        }

        console.log(
            "INFO - No permission found - not in admins array, no admin edge, not system admin",
        );
        console.log("INFO - ===== checkPermission: DENIED =====");
        return Result.ok(false);
    }
}

module.exports = { BaseRepository };
