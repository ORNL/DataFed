"use strict";

const request = require("@arangodb/request");
const { baseUrl } = module.context;

class LegacyAPIAdapter {
    constructor() {
        this.baseUrl = `${baseUrl}/repo`;
    }

    createRepository(clientKey, repoData) {
        throw new Error("Legacy API does not support repository creation via API");
    }

    listRepositories(clientKey, options = {}) {
        const params = [`client=${clientKey}`];
        if (options.all) params.push("all=true");
        if (options.type) params.push(`type=${options.type}`);

        return request.get(`${this.baseUrl}/list?${params.join("&")}`);
    }

    viewRepository(repoId) {
        return request.get(`${this.baseUrl}/view?id=${repoId}`);
    }

    updateRepository(repoId, updates, clientKey) {
        return request.post(`${this.baseUrl}/update?client=${clientKey}`, {
            json: true,
            body: { id: repoId, ...updates },
        });
    }

    createAllocation(allocData, clientKey = null) {
        const client = clientKey || allocData.client;
        const params = [
            `client=${client}`,
            `subject=${allocData.subject}`,
            `repo=${allocData.repo}`,
            `data_limit=${allocData.size || allocData.data_limit}`,
            `rec_limit=${allocData.rec_limit || 1000}`,
        ];

        if (allocData.path) params.push(`path=${allocData.path}`);

        return request.get(`${this.baseUrl}/alloc/create?${params.join("&")}`);
    }

    deleteAllocation(allocData, clientKey = null) {
        const client = clientKey || allocData.client;
        const params = [
            `client=${client}`,
            `subject=${allocData.subject}`,
            `repo=${allocData.repo}`,
        ];

        return request.get(`${this.baseUrl}/alloc/delete?${params.join("&")}`);
    }

    listAllocationsByRepo(repoId, clientKey) {
        return request.get(`${this.baseUrl}/alloc/list/by_repo?client=${clientKey}&repo=${repoId}`);
    }

    listAllocationsByOwner(ownerId, includeStats = false) {
        return request.get(
            `${this.baseUrl}/alloc/list/by_owner?owner=${ownerId}&stats=${includeStats}`,
        );
    }

    viewAllocation(repoId, subject, clientKey) {
        return request.get(
            `${this.baseUrl}/alloc/view?client=${clientKey}&repo=${repoId}&subject=${subject}`,
        );
    }

    getAllocationStats(repoId, subject, clientKey) {
        return request.get(
            `${this.baseUrl}/alloc/stats?client=${clientKey}&repo=${repoId}&subject=${subject}`,
        );
    }

    setAllocationLimits(repoId, subject, dataLimit, recLimit, clientKey) {
        return request.get(
            `${this.baseUrl}/alloc/set?client=${clientKey}&subject=${subject}&repo=${repoId}&data_limit=${dataLimit}&rec_limit=${recLimit}`,
        );
    }

    setDefaultAllocation(repoId, clientKey) {
        return request.get(`${this.baseUrl}/alloc/set/default?client=${clientKey}&repo=${repoId}`);
    }

    deleteRepository(repoId, clientKey) {
        return request.get(`${this.baseUrl}/delete?client=${clientKey}&id=${repoId}`);
    }

    calculateSize(items, recurse, clientKey) {
        return request.get(
            `${this.baseUrl}/calc_size?client=${clientKey}&items=${items}&recurse=${recurse}`,
        );
    }
}

class NewAPIAdapter {
    constructor() {
        this.baseUrl = `${baseUrl}/repo`;
    }

    createRepository(clientKey, repoData) {
        return request.post(`${this.baseUrl}/create?client=${clientKey}`, {
            json: true,
            body: repoData,
        });
    }

    listRepositories(clientKey, options = {}) {
        const params = [`client=${clientKey}`];
        if (options.all) params.push("all=true");
        if (options.type) params.push(`type=${options.type}`);

        return request.get(`${this.baseUrl}/list?${params.join("&")}`);
    }

    viewRepository(repoId) {
        return request.get(`${this.baseUrl}/view?id=${repoId}`);
    }

    updateRepository(repoId, updates, clientKey) {
        return request.post(`${this.baseUrl}/update?client=${clientKey}`, {
            json: true,
            body: { id: repoId, ...updates },
        });
    }

    createAllocation(allocData, clientKey = null) {
        const client = clientKey || allocData.client;
        const body = {
            repo: allocData.repo,
            subject: allocData.subject,
            size: allocData.size || allocData.data_limit,
        };

        if (allocData.path) body.path = allocData.path;
        if (allocData.metadata) body.metadata = allocData.metadata;

        return request.post(`${this.baseUrl}/alloc/create?client=${client}`, {
            json: true,
            body: body,
        });
    }

    deleteAllocation(allocData, clientKey = null) {
        const client = clientKey || allocData.client;
        return request.post(`${this.baseUrl}/alloc/delete?client=${client}`, {
            json: true,
            body: {
                repo: allocData.repo,
                subject: allocData.subject,
            },
        });
    }

    listAllocationsByRepo(repoId, clientKey) {
        throw new Error("New API does not support listAllocationsByRepo");
    }

    listAllocationsByOwner(ownerId, includeStats = false) {
        throw new Error("New API does not support listAllocationsByOwner");
    }

    viewAllocation(repoId, subject, clientKey) {
        throw new Error("New API does not support viewAllocation");
    }

    getAllocationStats(repoId, subject, clientKey) {
        throw new Error("New API does not support getAllocationStats");
    }

    setAllocationLimits(repoId, subject, dataLimit, recLimit, clientKey) {
        throw new Error("New API does not support setAllocationLimits");
    }

    setDefaultAllocation(repoId, clientKey) {
        throw new Error("New API does not support setDefaultAllocation");
    }

    deleteRepository(repoId, clientKey) {
        throw new Error("New API does not support deleteRepository");
    }

    calculateSize(items, recurse, clientKey) {
        throw new Error("New API does not support calculateSize");
    }
}

function createAPIAdapter(apiVersion) {
    switch (apiVersion) {
        case "legacy":
            return new LegacyAPIAdapter();
        case "new":
            return new NewAPIAdapter();
        default:
            throw new Error(`Unknown API version: ${apiVersion}`);
    }
}

module.exports = {
    LegacyAPIAdapter,
    NewAPIAdapter,
    createAPIAdapter,
};
