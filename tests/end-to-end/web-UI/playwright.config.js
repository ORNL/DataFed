// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
    //If the server is slow, consider increasing the timeout (in ms)
    timeout: 30000,

    globalSetup: require.resolve("./auth.setup"),

    testDir: "./scripts",

    /* Run tests in files in parallel */
    fullyParallel: false,

    /* Fail the build on CI_DATAFED_END_TO_END_WEB_RETRIES if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI_DATAFED_END_TO_END_WEB_RETRIES,

    /* Retry on CI_DATAFED_END_TO_END_WEB_RETRIES only */
    retries: process.env.CI_DATAFED_END_TO_END_WEB_RETRIES ? 2 : 0,

    /* Opt out of parallel tests on CI_DATAFED_END_TO_END_WEB_RETRIES. */
    workers: 1,

    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: "html",

    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: "on-first-retry",
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        ignoreHTTPSErrors: true,
        actionTimeout: 45000,
        navigationTimeout: 60000,
        launchOptions: {
            args: ["--ignore-certificate-errors"],
        },
        storageState: "./.auth/auth.json",
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
            },
        },

        // {
        //   name: 'firefox',
        //   use: {
        //     ...devices['Desktop Firefox'],
        //   },
        // },

        // {
        //   name: 'webkit',
        //   use: {
        //     ...devices['Desktop Safari'],
        //    },
        // },
    ],
});
