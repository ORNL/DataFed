const { chromium } = require('playwright');
const path = require('path');
const process = require('process');
const fs = require('fs');
const raw = fs.readFileSync('./DataFed_config.json', 'utf-8');
const rawJSON = JSON.parse(raw);
const DataFedDomain = "https://" + rawJSON.domain;

console.log("******Inside Setup file******");

module.exports = async function () {
    // if a playwright page object doesn't exist, create one
    const browser = await chromium.launch({
        args: ['--ignore-certificate-errors'],
        timeout: 30000,
    });
    // const context = await browser.newContext({
    //     ignoreHTTPSErrors: true,
    // });

    const page = await browser.newPage();  
    console.log("new page object created");
    
    // Go to the website and login through globus using a tester account
    // if breaks here, check that DataFed_config.json is correct, if testing locally, use "localhost"
    // if in CI, just let cmake generate the json file
    await page.goto(DataFedDomain + '/ui/welcome');
    await page.waitForTimeout(2000);
    if (await page.getByRole('button', { name: 'Log In / Register' }).isVisible()) {
        await page.getByRole('button', { name: 'Log In / Register' }).click();
        if (page.getByRole('link', { name: 'Globus globus' }).isVisible()) {
            page.getByRole('button', { name: 'Globus ID to sign in' }).click();
            if (page.getByLabel('Username @globusid.org').isEditable()) {
                // changes the username and password in the .env file if needed
                await page.getByLabel('Username @globusid.org').fill(process.env.DATAFED_WEB_TEST_USERNAME);
                await page.getByLabel('Password').fill(process.env.DATAFED_WEB_TEST_PASSWORD);
                await page.click('button[type="submit"]');
                await page.waitForURL(DataFedDomain + '/ui/main')
                console.log("******PAST LOGIN******");
                await page.context().storageState({ path: './.auth/auth.json'}); //TESTING
                console.log("******Done with login******");
            } else {
                console.log("DID NOT SEE FORM");
            }
        } else {
            console.log("DID NOT SEE GLOBUS BUTTON");
        } 
    } else {
        console.log("DID NOT SEE LOGIN BUTTON");
    }
    await browser.close();
    //return page;  // pass on the page variable if using this function directly in a test script
};

// TODO this is not as efficient as storing the states in the context variable,
// something like "page.context().storagestate" would work better in the future when
// there are many more test files

