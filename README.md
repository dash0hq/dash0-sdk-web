# Dash0 Web SDK

## Development

### E2E Tests

We run e2e tests via webdriverIO and sauce labs.
They currently don't have a fully local setup, but can be executed locally against sauce labs.

#### Setup

- Get a sauce labs account
- Create a `.env` file based on `.env.example` and provide your sauce labs credentials.
- Run the tests via `pnpm run test:e2e`

#### Why do tests run on ports 5000, 5001 and 5002?

We need multiple ports to properly test cors behaviour.
5000 to 5002 are specifically chosen for their [behaviour in combination with localhost proxies](https://docs.saucelabs.com/secure-connections/sauce-connect-5/specifications/localhost-ports/#ports-for-proxying-localhost-traffic)
