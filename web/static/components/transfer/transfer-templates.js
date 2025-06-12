import { escapeHTML } from "../../util.js";
import { TransferMode } from "../../models/transfer-model.js";

/**
 * @module TransferTemplates
 * @description Template strings for transfer dialog components
 */

/**
 * Gets mode-specific options template HTML
 * @param {TransferMode[keyof TransferMode]} mode - The transfer mode
 * @returns {string} Mode-specific options template HTML
 */
export function getModeSpecificOptionsTemplate(mode) {
    let responseHTML = "";
    if (mode === TransferMode.TT_DATA_GET) {
        responseHTML = `<br><label for='orig_fname'>Download to original filename(s)</label>
            <input id='orig_fname' type='checkbox'>
        `;
    } else if (mode === TransferMode.TT_DATA_PUT) {
        responseHTML = `<br>File extension override: <input id='ext' type='text'><br>`;
    }

    return responseHTML;
}

/**
 * Gets the transfer options template HTML
 * @param {TransferMode[keyof TransferMode]} mode - The transfer mode
 * @returns {string} Transfer options template HTML
 */
export function getTransferOptionsTemplate(mode) {
    return `
        <br>Transfer Encryption:&nbsp
        <input type='radio' id='encrypt_none' name='encrypt_mode' value='0'>
        <label for='encrypt_none'>None</label>&nbsp
        <input type='radio' id='encrypt_avail' name='encrypt_mode' value='1' checked/>
        <label for='encrypt_avail'>If Available</label>&nbsp
        <input type='radio' id='encrypt_req' name='encrypt_mode' value='2'/>
        <label for='encrypt_req'>Required</label><br>
        ${getModeSpecificOptionsTemplate(mode)}
    `;
}

/**
 * Gets the dialog template HTML
 * @param {object} labels - The labels for dialog elements
 * @param {string} labels.record - Record label text
 * @param {string} labels.endpoint - Endpoint label text
 * @param {TransferMode[keyof TransferMode]} mode - The transfer mode
 * @returns {string} The dialog template HTML
 */
export function getDialogTemplate(labels, mode) {
    return `
        <div class='ui-widget' style='height:95%'>
            ${labels.record}: <span id='title'></span><br>
            <div class='col-flex' style='height:100%'>
                <div id='records' class='ui-widget ui-widget-content'
                     style='flex: 1 1 auto;display:none;height:6em;overflow:auto'>
                </div>
                <div style='flex:none'><br>
                    <span>${labels.endpoint} Path:</span>
                    <div style='display: flex; align-items: flex-start;'>
                        <textarea class='ui-widget-content' id='path' rows=3
                                 style='width:100%;resize:none;'></textarea>
                        <button class='btn small' id='browse' style='margin-left:10px; line-height:1.5; 
                        vertical-align: top;' disabled>
                            Browse
                        </button>
                    </div>
                    <br>
                    <select class='ui-widget-content ui-widget' id='matches' size='7' style='width: 100%;' disabled>
                        <option disabled selected>No Matches</option>
                    </select>
                    ${getTransferOptionsTemplate(mode)}
                </div>
            </div>
        </div>
    `;
}

/**
 * Creates HTML for endpoint matches
 * @param {Array<object>} endpoints - List of endpoint objects
 * @returns {string} Generated HTML for matches
 */
export function createMatchesHtml(endpoints) {
    const html = [
        `<option disabled selected>${endpoints.length} match${
            endpoints.length > 1 ? "es" : ""
        }</option>`,
    ];

    endpoints.forEach((ep) => {
        html.push(`
            <option title="${escapeHTML(ep.description || "(no info)")}">${escapeHTML(
                ep.display_name || ep.name,
            )}</option>
        `);
    });

    return html.join("");
}

/**
 * Formats a record title for display
 * @param {object} item - The record item
 * @param {object} info - Record information
 * @returns {string} Formatted HTML string for record title
 * @private
 */
export function formatRecordTitle(item, info) {
    const titleText =
        `${escapeHTML(item.id)}&nbsp&nbsp&nbsp` +
        `<span style='display:inline-block;width:9ch'>${escapeHTML(info.info)}</span>` +
        `&nbsp${escapeHTML(item.title)}`;

    return info.selectable ? titleText : `<span style='color:#808080'>${titleText}</span>`;
}
