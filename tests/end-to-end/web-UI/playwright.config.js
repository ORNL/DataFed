// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');

const raw = fs.readFileSync('./DataFed_config.json', 'utf-8'); // sometimes vscode will give an error even after creating the DataFed_config.json file, ignore it.
const rawJSON = JSON.parse(raw);
const DataFedDomain = "https://" + rawJSON.domain;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  //If the server is slow, consider increasing the timeout (in ms)
  timeout: 30000,

  globalSetup: require.resolve('./auth.setup'),

  globalTeardown: require.resolve('./auth.tearDown'),

  testDir: './scripts',

  /* Run tests in files in parallel */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: 1,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  // reporter: 'html',

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    ignoreHTTPSErrors: true,
    
    launchOptions: {
      args: ['--ignore-certificate-errors'],
    },
    storageState: './.auth/auth.json',
    baseURL: DataFedDomain, //DOMAIN HERE make sure it's correct in the CI pipeline
  },
  


  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
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

