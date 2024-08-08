# Steps to run playwright (2 ways) assuming you have at least the metadata service running somewhere that is port forwarded

## FIRST: Store globusid username and password in the environment (either in directly in the env or in the )

### Storing in the enviroment locally

    export DATAFED_WEB_TEST_USERNAME=YOUR_USERNAME_HERE
    export DATAFED_WEB_TEST_PASSWORD=YOUR_PASSWORD_HERE

## Install all dependencies including playwright

### cd to the playwright directory, in this case

    cd tests/end-to-end/web-UI

    npm ci

### (Optional) If notified that the browser binaries are not there

    npx playwright install

## (Option 1) IF running test in a CI environment

### cd to the root of DataFed

    cmake -S . -B build -DBUILD_AUTHZ=OFF -DBUILD_AUTHZ_WITH_SYSLOG=OFF -DBUILD_CORE_SERVER=OFF -DBUILD_COMMON=OFF -DBUILD_DOCS=OFF -DBUILD_FOXX=OFF -DBUILD_REPO_SERVER=OFF -DBUILD_PYTHON_CLIENT=OFF -DBUILD_TESTS=ON -DENABLE_UNIT_TESTS=OFF -DENABLE_END_TO_END_WEB_TESTS=ON

## run the test

    cmake --build build --target end_to_end_web_tests

## (Option 2) IF running on a personal machine

### 1. Create a copy of the file DataFed_config.json.in, without the .in at the end of the file name

### 2. Change domain name to the URL that DataFed is on

    {
        "domain": "localhost" // URL here, can be just localhost
    }

### 3. Run playwright

    # go to the web_UI directory
    cd tests/end-to-end/web-UI
    npx playwright test

## Test Scripts

All test scripts are stored in the scripts folder. You do not have to log in during the test script, that is done in the auth.setup.js file. The authentication state (similar to cookies) is stored in the .auth folder that will be generated in the auth.setup.js file. All test script will use this json file to skip the log in phase everytime. Also, there is no clean up in the tearDown piece, consider fixing that in the future if needed.

## playwright.config.js file

This file is like the "brain" of playwright. It 'configs' everything.

    // allows auth.setup.js to run before all scripts
    globalSetup: require.resolve('./auth.setup')

    // allows auth.tearDown.js to run after all scripts
    globalTeardown: require.resolve('./auth.tearDown')

    // Right now parallel isn't enabled because of conflicting state issue.
    // If considering to use parallel, you would need multiple accounts.
    fullyParallel: false

    // The below 2 options are there to ignore browsers annoying https certificates, aka to bypass the "ArE YoU SuRe YoU WaNt To oPeN ThIs".
    // for if you're running datafed locally
    ignoreHTTPSErrors: true,
    
    launchOptions: {
      args: ['--ignore-certificate-errors'],
    },

    // showing where you are saving the auth cookies and using it.
    storageState: './.auth/auth.json',

    // allows us to use page.goto('/') instead of goto("https://URLHERE")
    baseURL: DataFedDomain, //DOMAIN HERE make sure it's correct in the CI pipeline
