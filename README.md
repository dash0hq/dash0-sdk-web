# Dash0 Web SDK

## Releases

We automatically release new versions of this package whenever a PR is merged to main and the ci is able to detect a
valid version increase from the merge commit. It uses [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)
to calculate the version increase and to generate additional messaging such as changelogs.
Please make sure PR merge commits are formatted accordingly, not matching messages will create a PATCH release, but no
changelog entry.
Examples:

- A PATCH release:
  ```
  fix: Include missing user.name attribute
  ```
- A MINOR release:

  ```
  feat: Add instrumentation for fetch()

  The sdk now supports automatic instrumentation of the fetch api
  ```

- A MAJOR release:

  ```
  feat: Add version two of page-load instrumentation

  BREAKING CHANGE: This adds a new updated instrumentation for page-loads, it is no longer
  compatible with the previous version. For instructions on how to update see: https://example.com
  ```

  or:

  ```
  feat!: Add version two of page-load instrumentation

  This adds a new updated instrumentation for page-loads, it is no longer
  compatible with the previous version. For instructions on how to update see: https://example.com
  ```

- NO changelog entry, PATCH release:
  ```
  chore: Improve spelling of README
  ```

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
