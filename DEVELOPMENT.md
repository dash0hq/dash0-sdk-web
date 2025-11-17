# Development

## Releases

This project follows the [Semantic Versioning](https://semver.org/) scheme `MAJOR.MINOR.PATH`.
In this means:

- `MAJOR` versions are released for significant changes in operation or backward incompatible API changes.
- `MINOR` versions add functionality in a backward compatible manner.
- `PATCH` versions include bug and security fixes which do not break backward compatibility.

We automatically release new versions of this package whenever a PR is merged to main and the CI is able to detect a
valid version increase from the merge commit. It uses [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)
to calculate the version increase and to generate additional messaging such as changelogs.
Please make sure PR merge commits are formatted accordingly.
Examples:

- A `PATCH` release:
  ```
  fix: Include missing user.name attribute
  ```
- A `MINOR` release:

  ```
  feat: Add instrumentation for fetch()

  The sdk now supports automatic instrumentation of the fetch api
  ```

- A `MAJOR` release:

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

## E2E Tests

We run e2e tests via webdriverIO and lambda test.
They currently don't have a fully local setup, but tests can be executed locally targeting chrome headless via `pnpm run test:e2e:local`.

### Setup

- Get a lambda test account
- Create a `.env` file based on `.env.example` and provide your lambda test credentials.
- Run the tests via `pnpm run test:e2e`

### Why do tests run on ports 8010, 8011 and 8012?

We need multiple ports to properly test cors behaviour.
