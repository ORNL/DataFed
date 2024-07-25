const { chromium } = require('playwright');
const path = require('path');
const process = require('process');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

console.log("******Inside Setup file******");

module.exports = async function ({ browser }) {
    // if a playwright page object doesn't exist, create one
    browser = await chromium.launch({
        args: ['--ignore-certificate-errors'],
        timeout: 30000,
    });
    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();  
    console.log("new page object created");
    

    // Go to the website and login through globus using a tester account
    await page.goto('https://localhost/ui/welcome');//TESTING
    if (await page.getByRole('button', { name: 'Log In / Register' }).isVisible()) {
        await page.getByRole('button', { name: 'Log In / Register' }).click();
        if (page.getByRole('link', { name: 'Globus globus' }).isVisible()) {
            page.getByRole('button', { name: 'Globus ID to sign in' }).click();
            if (page.getByLabel('Username @globusid.org').isEditable()) {
                // changes the username and password in the .env file if needed
                await page.getByLabel('Username @globusid.org').fill(process.env.TEST_USERNAME);
                await page.getByLabel('Password').fill(process.env.TEST_PASSWORD);
                await page.getByRole('button', { name: 'Log In' }).click();
                console.log("******PAST LOGIN******");
                // await page.context().storageState({ path: './tests/end-to-end/web-UI/.auth/user.json'}); //TESTING
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
    
    return page;  // pass on the page variable if using this function directly in a test script
};

// TODO this is not as efficient as storing the states in the context variable,
// something like "page.context().storagestate" would work better in the future when
// there are many more test files

