const { chromium } = require('playwright');

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
    await page.goto('./');
    await page.getByRole('button', { name: '' }).click();
    await browser.close();
};