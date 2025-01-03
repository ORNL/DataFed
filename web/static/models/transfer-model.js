import * as util from "../util.js";

/**
 * Model class for transfer dialog data and state
 */
export class TransferModel {
    /**
     * @param {number} mode - Transfer mode (GET/PUT)
     * @param {Array<Object>} records - Data records
     */
    constructor(mode, records) {
        this.mode = mode;
        this.records = records || [];
        this.selectedIds = new Set();
        this.endpointManager = null;
        this.transferConfig = this.initializeConfig(records);

        if (records) {
            this.stats = this.calculateStats();
        }
    }

    initializeConfig(records) {
        return {
            path: records?.[0]?.source || "",
            encrypt: 1,
            extension: "",
            origFilename: false,
        };
    }

    calculateStats() {
        return this.records.reduce(
            (stats, record) => {
                if (this.isRecordValid(record)) {
                    stats.totalSize += parseInt(record.size);
                    this.selectedIds.add(record.id);
                } else {
                    stats.skippedCount++;
                }
                return stats;
            },
            { totalSize: 0, skippedCount: 0 },
        );
    }

    /**
     * Check if record is valid for transfer
     * @param {Object} record - Data record
     * @returns {boolean}
     */
    isRecordValid(record) {
        return record.size > 0 && !record.locked;
    }

    /**
     * Get selected record IDs
     * @returns {Array<string>}
     */
    getSelectedIds() {
        return Array.from(this.selectedIds);
    }

    /**
     * Get record information
     * @private
     * @param {Object} item Record item
     * @returns {Object} Record info
     */
    getRecordInfo(item) {
        if (item.size === 0) return { info: "(empty)", selectable: false };
        if (item.locked) return { info: "(locked)", selectable: false };
        return {
            info: util.sizeToString(item.size),
            selectable: true,
        };
    }

    /**
     * Get default path for endpoint
     * @param {Object} endpoint Endpoint data
     * @returns {string} Default path
     */
    getDefaultPath(endpoint) {
        if (!this.endpointManager) return "";
        const path = this.endpointManager.name + (this.endpointManager.default_directory || "/");
        return path.replace("{server_default}/", "");
    }
}
