"use strict";

const request = require("@arangodb/request");
const { baseUrl } = module.context;

class LegacyAPIAdapter {
    constructor() {
        this.baseUrl = `${baseUrl}/repo`;
    }

    _get(endpoint, params = {}) {
        const queryString = this._buildQueryString(params);
        const url = queryString
            ? `${this.baseUrl}${endpoint}?${queryString}`
            : `${this.baseUrl}${endpoint}`;
        return request.get(url);
    }

    _post(endpoint, params = {}, body = {}) {
        const queryString = this._buildQueryString(params);
        const url = queryString
            ? `${this.baseUrl}${endpoint}?${queryString}`
            : `${this.baseUrl}${endpoint}`;
        return request.post(url, { json: true, body });
    }

    _buildQueryString(params) {
        if (Array.isArray(params)) {
            return params.join("&");
        }
        const pairs = Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${value}`);
        return pairs.length > 0 ? pairs.join("&") : "";
    }

    createRepository(clientKey, repoData) {
        throw new Error("Legacy API does not support repository creation via API");
    }

    listRepositories(clientKey, options = {}) {
        const params = { client: clientKey };
        if (options.all) params.all = true;
        if (options.type) params.type = options.type;
        return this._get("/list", params);
    }

    viewRepository(repoId) {
        return this._get("/view", { id: repoId });
    }

    updateRepository(repoId, updates, clientKey) {
        return this._post("/update", { client: clientKey }, { id: repoId, ...updates });
    }

    createAllocation(allocData, clientKey = null) {
        const client = clientKey || allocData.client;
        const params = {
            client: client,
            subject: allocData.subject,
            repo: allocData.repo,
            data_limit: allocData.size || allocData.data_limit,
            rec_limit: allocData.rec_limit || 1000,
        };
        if (allocData.path) params.path = allocData.path;
        return this._get("/alloc/create", params);
    }

    deleteAllocation(allocData, clientKey = null) {
        const client = clientKey || allocData.client;
        return this._get("/alloc/delete", {
            client: client,
            subject: allocData.subject,
            repo: allocData.repo,
        });
    }

    listAllocationsByRepo(repoId, clientKey) {
        return this._get("/alloc/list/by_repo", { client: clientKey, repo: repoId });
    }

    listAllocationsByOwner(ownerId, includeStats = false) {
        return this._get("/alloc/list/by_owner", { owner: ownerId, stats: includeStats });
    }

    viewAllocation(repoId, subject, clientKey) {
        return this._get("/alloc/view", { client: clientKey, repo: repoId, subject: subject });
    }

    getAllocationStats(repoId, subject, clientKey) {
        return this._get("/alloc/stats", { client: clientKey, repo: repoId, subject: subject });
    }

    setAllocationLimits(repoId, subject, dataLimit, recLimit, clientKey) {
        return this._get("/alloc/set", {
            client: clientKey,
            subject: subject,
            repo: repoId,
            data_limit: dataLimit,
            rec_limit: recLimit,
        });
    }

    setDefaultAllocation(repoId, clientKey) {
        return this._get("/alloc/set/default", { client: clientKey, repo: repoId });
    }

    deleteRepository(repoId, clientKey) {
        return this._get("/delete", { client: clientKey, id: repoId });
    }

    calculateSize(items, recurse, clientKey) {
        return this._get("/calc_size", { client: clientKey, items: items, recurse: recurse });
    }
}

class NewAPIAdapter {
    constructor() {
        this.baseUrl = `${baseUrl}/repo`;
    }

    _get(endpoint, params = {}) {
        const queryString = this._buildQueryString(params);
        const url = queryString
            ? `${this.baseUrl}${endpoint}?${queryString}`
            : `${this.baseUrl}${endpoint}`;
        return request.get(url);
    }

    _post(endpoint, params = {}, body = {}) {
        const queryString = this._buildQueryString(params);
        const url = queryString
            ? `${this.baseUrl}${endpoint}?${queryString}`
            : `${this.baseUrl}${endpoint}`;
        return request.post(url, { json: true, body });
    }

    _buildQueryString(params) {
        if (Array.isArray(params)) {
            return params.join("&");
        }
        const pairs = Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${value}`);
        return pairs.length > 0 ? pairs.join("&") : "";
    }

    createRepository(clientKey, repoData) {
        return this._post("/create", { client: clientKey }, repoData);
    }

    listRepositories(clientKey, options = {}) {
        const params = { client: clientKey };
        if (options.all) params.all = true;
        if (options.type) params.type = options.type;
        return this._get("/list", params);
    }

    viewRepository(repoId) {
        return this._get("/view", { id: repoId });
    }

    updateRepository(repoId, updates, clientKey) {
        return this._post("/update", { client: clientKey }, { id: repoId, ...updates });
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

        return this._post("/alloc/create", { client: client }, body);
    }

    deleteAllocation(allocData, clientKey = null) {
        const client = clientKey || allocData.client;
        return this._post(
            "/alloc/delete",
            { client: client },
            {
                repo: allocData.repo,
                subject: allocData.subject,
            },
        );
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
