import * as util from "../util.js";
import { TT_DATA_GET, TT_DATA_PUT } from "../model.js";

export const TransferMode = Object.freeze({
    TT_DATA_GET,
    TT_DATA_PUT,
    NULL: null,
});

/**
 * Model class for transfer dialog data and state
 */
export class TransferModel {
    #mode;
    #records;
    #selectedIds;
    #transferConfig;
    #stats;

    /**
     * @param {TransferMode[keyof TransferMode]} mode - Transfer mode
     * @param {Array<object>} records - Data records
     * @throws {Error} If invalid mode provided
     */
    constructor(mode, records) {
        this.#validateMode(mode);
        this.#mode = mode;
        this.#records = records || [];
        this.#selectedIds = new Set(); // Allows for O(1) lookups + ids are unique
        this.#transferConfig = this.#initializeConfig(records);

        if (records) {
            this.#stats = this.#calculateStats();
        }
    }

    #validateMode(mode) {
        const validModes = [...Object.values(TransferMode), null];
        if (!validModes.includes(mode)) {
            throw new Error(
                `Invalid transfer mode: ${mode}. Must be one of: ${validModes.join(", ")}`,
            );
        }
    }

    #initializeConfig(records) {
        return {
            path: records?.[0]?.source || "",
            encrypt: 1,
            extension: "",
            origFilename: false,
        };
    }

    #calculateStats() {
        return this.#records.reduce(
            (stats, record) => {
                if (this.isRecordValid(record)) {
                    stats.totalSize += parseInt(record.size);
                    this.#selectedIds.add(record.id);
                } else {
                    stats.skippedCount++;
                }
                return stats;
            },
            { totalSize: 0, skippedCount: 0 },
        );
    }

    get mode() {
        return this.#mode;
    }

    get records() {
        return [...this.#records];
    }

    get stats() {
        return { ...this.#stats };
    }

    /**
     * Check if record is valid for transfer
     * @param {object} record - Data record
     * @returns {boolean} is record valid
     */
    isRecordValid(record) {
        return record.size > 0 && !record.locked;
    }

    /**
     * Get record information
     * @param {object} item Record item
     * @returns {object} Record info
     */
    getRecordInfo(item) {
        if (item.size === 0) {
            return { info: "(empty)", selectable: false };
        } else if (item.locked) {
            return { info: "(locked)", selectable: false };
        } else {
            return {
                info: util.sizeToString(item.size),
                selectable: true,
            };
        }
    }
}
