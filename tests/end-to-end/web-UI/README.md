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

