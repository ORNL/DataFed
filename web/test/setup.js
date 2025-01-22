import { expect } from "chai";
import sinon from "sinon";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

/**
 * Get directory name for ES modules
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const jqueryPath = join(__dirname, "..", "static", "jquery", "jquery.js");
const jqueryCode = readFileSync(jqueryPath, "utf-8");

/**
 * Sets up a minimal DOM environment for testing
 * - Creates a JSDOM instance with basic HTML structure
 * - Sets up global browser-like objects (window, document, etc.)
 *
 * @returns {JSDOM} The configured JSDOM instance
 */
function setupTestDOM() {
    const dom = new JSDOM(
        `<!DOCTYPE html>                                                                                                                                             
          <html lang="">                                                                                                                                                      
              <body>                                                                                                                                                  
                  <div id="transfer-dialog"></div>                                                                                                                    
              </body>                                                                                                                                                 
          </html>`,
        {
            url: "http://localhost",
            pretendToBeVisual: true,
            runScripts: "dangerously",
        },
    );

    // Make DOM elements available globally
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.location = dom.window.location;
    global.HTMLElement = window.HTMLElement;
    global.Element = window.Element;
    global.Node = window.Node;
    global.Event = window.Event;

    return dom;
}

/**
 * Sets up a mock localStorage for testing
 * Use this when your code interacts with localStorage
 */
function setupLocalStorage() {
    global.localStorage = {
        getItem: () => {},
        setItem: () => {},
        removeItem: () => {},
    };
}

/**
 * Sets up jQuery in the test environment
 * - Evaluates real jQuery code in JSDOM context
 * - Adds mock implementations of common jQuery plugins
 *
 * @param {JSDOM} dom - The JSDOM instance to set up jQuery in
 */
function setupJQuery(dom) {
    // Evaluate jQuery in the JSDOM context
    dom.window.eval(jqueryCode);
    // Get jQuery from the JSDOM window and set it globally
    global.$ = global.jQuery = dom.window.jQuery;
    // Add mock implementations of jQuery plugins
    $.fn.extend({
        dialog: function () {
            this.trigger = () => {};
            this.close = () => {};
            return this;
        },
        button: function () {
            return this;
        },
        checkboxradio: function () {
            return this;
        },
    });
}

/**
 * Sets up error handling for tests
 * - Adds listeners for uncaught errors and unhandled rejections
 * - Enhances console.error to throw in test environment
 */
function setupErrorHandling() {
    // Handle uncaught errors
    window.addEventListener("error", (event) => {
        console.error("Error:", {
            message: event.error?.message || "Unknown error",
            stack: event.error?.stack,
            type: event.type,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
        });
    });

    // Handle unhandled promise rejections
    window.addEventListener("unhandledrejection", (event) => {
        console.error("Unhandled Promise Rejection:", {
            reason: event.reason,
            promise: event.promise,
        });
    });

    // Make console.error throw in test environment
    const originalConsoleError = console.error;
    console.error = (...args) => {
        originalConsoleError.apply(console, args);
        if (process.env.NODE_ENV === "test") {
            throw new Error(args.join(" "));
        }
    };
}

// Setup test environment
const dom = setupTestDOM();
setupLocalStorage();
setupJQuery(dom);
setupErrorHandling();

export { expect, sinon };
