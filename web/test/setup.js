import { expect } from "chai";
import sinon from "sinon";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jqueryPath = join(__dirname, "..", "static", "jquery", "jquery.js");
const jqueryCode = readFileSync(jqueryPath, "utf-8");

const dom = new JSDOM(
    `                                                                                                            
     <!DOCTYPE html>                                                                                                                
     <html>                                                                                                                         
         <body>                                                                                                                     
             <div id="transfer-dialog"></div>                                                                                       
         </body>                                                                                                                    
     </html>                                                                                                                        
 `,
    {
        url: "http://localhost",
        pretendToBeVisual: true,
        runScripts: "dangerously",
    },
);

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.location = dom.window.location;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.Event = window.Event;

global.localStorage = {
    getItem: () => {},
    setItem: () => {},
    removeItem: () => {},
};

// Evaluate jQuery in the JSDOM context
dom.window.eval(jqueryCode);
// Get jQuery from the JSDOM window and set it globally
global.$ = global.jQuery = dom.window.jQuery;

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

/** Error logging & handling */
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

window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled Promise Rejection:", {
        reason: event.reason,
        promise: event.promise,
    });
});

const originalConsoleError = console.error;
console.error = (...args) => {
    originalConsoleError.apply(console, args);
    if (process.env.NODE_ENV === "test") {
        throw new Error(args.join(" "));
    }
};

export { expect, sinon };
