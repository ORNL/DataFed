# Instructions

The end to end tests require that two users be created. Because we cannot
automate the authentication steps we will create entries in the database for two
users to be test users, the passwords for these test users should only exist in
the env.

The python API will be exclusively used to run the end to end tests, in this
folder

To use the python API you will need to build it

```bash
cmake -S. -B build -DBUILD_PYTHON_CLIENT=ON
cmake --build build --target pydatafed
```

## Playwright

On windows, it is recommended to run playwright directly on windows and not in
a docker container or on wsl2. If you do take that approach you will likely 
encounter compatibility problems, and will still need to stand up an XServer
on the windows host.

To run

```bash
npm install .
npx playwright install
npx playwright test
```

You can also use the playwright code generator to add additional tests.

```bash
npx playwright codegen
```

If you are running on linux you might be able to get away with running in a 
docker image. 

Below is a minimal dockerfile to build playwright with a few useful developer tools.

```Dockerfile
FROM mcr.microsoft.com/playwright:v1.45.1-noble

# Install Chromium only
WORKDIR /work
RUN npx playwright install chromium --with-deps; npx playwright install
RUN apt-get update && apt-get install -y ca-certificates bash vim && update-ca-certificates
```

Build it with.

```bash
docker build . -t playwright:latest
```

```bash
docker run --rm   -v "$PWD:/work"  -w /work -e DATAFED_WEB_TEST_USERNAME="$DATAFED_WEB_TEST_USERNAME" -e DATAFED_WEB_TEST_PASSWORD="$DATAFED_WEB_TEST_PASSWORD" -e DATAFED_DOMAIN="$DATAFED_DOMAIN"  -e DISPLAY=host.docker.
internal:0 playwright:latest npx -y playwright test
```

NOTE: By default the web tests are setup to run in headless mode but if you 
wish to see the web tests as they execute while debugging etc you will need
to edit the configuration in playwright.config.js

This might need to be specified in the following places
```
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                headless: false, // optional: run headed
            },
        },
    ]
```

```
    use: {
        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: "on-first-retry",
        headless: false,
        screenshot: "only-on-failure",
 
```

