const { chromium } = require('playwright');
const fs = require('fs');

const raw = fs.readFileSync('./DataFed_config.json', 'utf-8');
const rawJSON = JSON.parse(raw);
const DataFedDomain = "https://" + rawJSON.domain;

// Right now all this file does is logging out of the website, consider adding some clean ups in the future.
module.exports = async function () {
    console.log("******Inside Tear Down File******");
    const browser = await chromium.launch({
        args: ['--ignore-certificate-errors'],
        timeout: 30000,
    });
    const page = await browser.newPage({
        storageState: './.auth/auth.json'
    });  
    console.log("new page object created");
    
    // Go to the website and login through globus using a tester account
    await page.goto(DataFedDomain + '/');
    await page.getByRole('button', { name: '' }).click(); // clicking the log out button
    console.log("******Logged out******");
    await browser.close();
};