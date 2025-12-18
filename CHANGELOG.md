# Changelog

## [0.18.2](https://github.com/dash0hq/dash0-sdk-web/compare/0.18.1...0.18.2) (2025-12-18)

### Bug Fixes

- move development related dependencies to "devDependencies” ([#74](https://github.com/dash0hq/dash0-sdk-web/issues/74)) ([ed744f5](https://github.com/dash0hq/dash0-sdk-web/commit/ed744f53858ce6b9428ad5d09fee84db11facf70))

## [0.18.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.18.0...0.18.1) (2025-11-28)

### Bug Fixes

- add fallback to location.hostname if serviceName is not provided ([#69](https://github.com/dash0hq/dash0-sdk-web/issues/69)) ([2088a75](https://github.com/dash0hq/dash0-sdk-web/commit/2088a7531c88245d11d86b47a17e2d7b4707ca66))

## [0.18.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.17.0...0.18.0) (2025-11-17)

### Features

- Added support for attributes for the `reportError` function ([#66](https://github.com/dash0hq/dash0-sdk-web/issues/66)) ([19c41a3](https://github.com/dash0hq/dash0-sdk-web/commit/19c41a38f95ca9ee0f056b8695ff8f7baba6c017))

## [0.17.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.16.3...0.17.0) (2025-11-12)

### Features

- **unhandled-error:** you can now pass additional attributes ([#64](https://github.com/dash0hq/dash0-sdk-web/issues/64)) ([088873b](https://github.com/dash0hq/dash0-sdk-web/commit/088873b25d75669c3f20014e71df7b654b013259))

## [0.16.3](https://github.com/dash0hq/dash0-sdk-web/compare/0.16.2...0.16.3) (2025-10-28)

### Bug Fixes

- disable transport compression ([#63](https://github.com/dash0hq/dash0-sdk-web/issues/63)) ([3c8c87a](https://github.com/dash0hq/dash0-sdk-web/commit/3c8c87af7ac1af1c226869efede0aa5a0ae7011f))

## [0.16.2](https://github.com/dash0hq/dash0-sdk-web/compare/0.16.1...0.16.2) (2025-10-14)

### Bug Fixes

- **fetch:** do not wrap body for responses that cant have a body ([#59](https://github.com/dash0hq/dash0-sdk-web/issues/59)) ([9b6b601](https://github.com/dash0hq/dash0-sdk-web/commit/9b6b6017c9166f081e8d372225cb80edef44b8d7))

## [0.16.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.16.0...0.16.1) (2025-10-10)

### Bug Fixes

- **fetch:** stop cloning responses and eagerly reading ([#58](https://github.com/dash0hq/dash0-sdk-web/issues/58)) ([1ab7bd3](https://github.com/dash0hq/dash0-sdk-web/commit/1ab7bd300bc60c0fe6aeffe8cec7536dd5d26647))

## [0.16.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.15.0...0.16.0) (2025-09-23)

### Features

- Add xray propagator and introduce propagator config ([#54](https://github.com/dash0hq/dash0-sdk-web/issues/54)) ([2012e7e](https://github.com/dash0hq/dash0-sdk-web/commit/2012e7ec5f3def1c2aabe0ce9b3836eab3152e1e))

## [0.15.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.14.1...0.15.0) (2025-09-05)

### Features

- remove rate limit on total event count ([#53](https://github.com/dash0hq/dash0-sdk-web/issues/53)) ([a0a24bf](https://github.com/dash0hq/dash0-sdk-web/commit/a0a24bf05b3474e965a378e2f3e7b3668d80c493))

## [0.14.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.14.0...0.14.1) (2025-08-26)

### Bug Fixes

- add missing exports for utility types ([#51](https://github.com/dash0hq/dash0-sdk-web/issues/51)) ([7449306](https://github.com/dash0hq/dash0-sdk-web/commit/744930681e2f928410b5c736a70639dbbc6f4121))

## [0.14.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.13.5...0.14.0) (2025-08-26)

### Features

- allow instrumentation selection and url scrubbing ([#50](https://github.com/dash0hq/dash0-sdk-web/issues/50)) ([17ccd4a](https://github.com/dash0hq/dash0-sdk-web/commit/17ccd4a678112bb9afbc2263aa84c316d7a8f1cb))

## [0.13.5](https://github.com/dash0hq/dash0-sdk-web/compare/0.13.4...0.13.5) (2025-08-25)

### Bug Fixes

- properly include missing type definitions ([#49](https://github.com/dash0hq/dash0-sdk-web/issues/49)) ([1eee7a2](https://github.com/dash0hq/dash0-sdk-web/commit/1eee7a2df78bbab705ef2d582b0a1ffaeddbc105))

## [0.13.4](https://github.com/dash0hq/dash0-sdk-web/compare/0.13.3...0.13.4) (2025-08-25)

### Bug Fixes

- prefix url attributes for current page ([#47](https://github.com/dash0hq/dash0-sdk-web/issues/47)) ([6a36700](https://github.com/dash0hq/dash0-sdk-web/commit/6a367008b26614bfe02a666c66975241e5800648))

## [0.13.3](https://github.com/dash0hq/dash0-sdk-web/compare/0.13.2...0.13.3) (2025-08-12)

## [0.13.2](https://github.com/dash0hq/dash0-sdk-web/compare/0.13.1...0.13.2) (2025-07-29)

### Bug Fixes

- fetch instrumentation timing issues ([#46](https://github.com/dash0hq/dash0-sdk-web/issues/46)) ([0f06e09](https://github.com/dash0hq/dash0-sdk-web/commit/0f06e09de22852b0a3a6b3471f6f8ee7cf92a3b9))

## [0.13.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.13.0...0.13.1) (2025-07-29)

## [0.13.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.12.1...0.13.0) (2025-07-24)

### Features

- send the "dash0.web.event.id" attribute ([#44](https://github.com/dash0hq/dash0-sdk-web/issues/44)) ([70e9b8e](https://github.com/dash0hq/dash0-sdk-web/commit/70e9b8e19c5fc84dbb8b24c37979e94ded4324bd))

## [0.12.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.12.0...0.12.1) (2025-07-23)

## [0.12.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.11.2...0.12.0) (2025-07-18)

### Features

- update span-id generation ([#42](https://github.com/dash0hq/dash0-sdk-web/issues/42)) ([6c0bcb6](https://github.com/dash0hq/dash0-sdk-web/commit/6c0bcb69817b6a1f1852d0f26c15d2815c9a4e1c))

## [0.11.2](https://github.com/dash0hq/dash0-sdk-web/compare/0.11.1...0.11.2) (2025-07-18)

### Bug Fixes

- ignore attributes with empty keys ([#41](https://github.com/dash0hq/dash0-sdk-web/issues/41)) ([6e4f688](https://github.com/dash0hq/dash0-sdk-web/commit/6e4f68803d6648e51b01a6899b50da1a0709def5))

## [0.11.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.11.0...0.11.1) (2025-07-17)

### Bug Fixes

- rename event title attribute to avoid conflicts ([#40](https://github.com/dash0hq/dash0-sdk-web/issues/40)) ([b2e219e](https://github.com/dash0hq/dash0-sdk-web/commit/b2e219e076cd64d8f0e73ccf866c1de3d5dd403b))

## [0.11.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.10.1...0.11.0) (2025-07-16)

### Features

- adapt session-id, trace-id and traceparent header ([#39](https://github.com/dash0hq/dash0-sdk-web/issues/39)) ([c8479b0](https://github.com/dash0hq/dash0-sdk-web/commit/c8479b035582bd3cdbbf4d1a6acc72973fff3efa))

## [0.10.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.10.0...0.10.1) (2025-07-08)

### Bug Fixes

- report all web-vital updates ([#38](https://github.com/dash0hq/dash0-sdk-web/issues/38)) ([fe47c89](https://github.com/dash0hq/dash0-sdk-web/commit/fe47c8934473287ca54b4a85361576dfe059578c))

## [0.10.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.6.1...0.10.0) (2025-07-04)

### Features

- skip version 0.6.2 ([#34](https://github.com/dash0hq/dash0-sdk-web/issues/34)) ([cf35c9a](https://github.com/dash0hq/dash0-sdk-web/commit/cf35c9a529b469e0a3ce90ad8f55befcb18c535e))

## [0.6.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.6.0...0.6.1) (2025-06-26)

### Bug Fixes

- set sampled bit in traceparent header ([ec78007](https://github.com/dash0hq/dash0-sdk-web/commit/ec78007def816dacc2d330abebacb03ada388830))

## [0.6.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.5.5...0.6.0) (2025-06-26)

### Features

- small improvements ([#29](https://github.com/dash0hq/dash0-sdk-web/issues/29)) ([34e8b0e](https://github.com/dash0hq/dash0-sdk-web/commit/34e8b0ef40f11073de2c213a390cfba66c87b795))

## [0.5.5](https://github.com/dash0hq/dash0-sdk-web/compare/0.5.4...0.5.5) (2025-06-26)

### Bug Fixes

- use correct parentid in traceparent header ([775842d](https://github.com/dash0hq/dash0-sdk-web/commit/775842d043368c674dece23850ec693255306e65))

## [0.5.4](https://github.com/dash0hq/dash0-sdk-web/compare/0.5.3...0.5.4) (2025-06-25)

## [0.5.3](https://github.com/dash0hq/dash0-sdk-web/compare/0.5.2...0.5.3) (2025-06-13)

### Bug Fixes

- use session storage for tab tracking ([#27](https://github.com/dash0hq/dash0-sdk-web/issues/27)) ([86ec6d4](https://github.com/dash0hq/dash0-sdk-web/commit/86ec6d4d7adfe134bc9a9ada579cd061b93bbc88))

## [0.5.2](https://github.com/dash0hq/dash0-sdk-web/compare/0.5.1...0.5.2) (2025-06-13)

### Bug Fixes

- include event name attribute in error events ([#26](https://github.com/dash0hq/dash0-sdk-web/issues/26)) ([d6b9c07](https://github.com/dash0hq/dash0-sdk-web/commit/d6b9c07f72eb184adf6e5af0966c108d68354d57))

## [0.5.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.5.0...0.5.1) (2025-06-10)

### Bug Fixes

- page load timestamps ([#25](https://github.com/dash0hq/dash0-sdk-web/issues/25)) ([ce220ae](https://github.com/dash0hq/dash0-sdk-web/commit/ce220aec15f3af7d97a718699c7a88724aba6012))

## [0.5.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.4.6...0.5.0) (2025-06-06)

### Features

- virtual page change support ([#23](https://github.com/dash0hq/dash0-sdk-web/issues/23)) ([e151832](https://github.com/dash0hq/dash0-sdk-web/commit/e15183298d7f0dcd06f76af72d27dbfee6b23830))

## [0.4.6](https://github.com/dash0hq/dash0-sdk-web/compare/0.4.5...0.4.6) (2025-06-06)

## [0.4.5](https://github.com/dash0hq/dash0-sdk-web/compare/0.4.4...0.4.5) (2025-06-05)

## [0.4.4](https://github.com/dash0hq/dash0-sdk-web/compare/0.4.3...0.4.4) (2025-06-04)

### Bug Fixes

- dont attempt to call global timer functions if undefined ([#21](https://github.com/dash0hq/dash0-sdk-web/issues/21)) ([b643683](https://github.com/dash0hq/dash0-sdk-web/commit/b643683844c077da32a9987b457e4386cfeb494b))

## [0.4.3](https://github.com/dash0hq/dash0-sdk-web/compare/0.4.2...0.4.3) (2025-05-30)

### Bug Fixes

- remove duplicated event name ([#20](https://github.com/dash0hq/dash0-sdk-web/issues/20)) ([52bec7f](https://github.com/dash0hq/dash0-sdk-web/commit/52bec7f7e7b2da04f06198a4ee69397440cd0139))

## [0.4.2](https://github.com/dash0hq/dash0-sdk-web/compare/0.4.1...0.4.2) (2025-05-30)

### Bug Fixes

- dont make users create otel type objects for events ([#19](https://github.com/dash0hq/dash0-sdk-web/issues/19)) ([5d3b8c0](https://github.com/dash0hq/dash0-sdk-web/commit/5d3b8c0cc2c687475dd50465b986e94ae796f870))

## [0.4.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.4.0...0.4.1) (2025-05-30)

### Bug Fixes

- expose send event api for module build ([#18](https://github.com/dash0hq/dash0-sdk-web/issues/18)) ([20a7c23](https://github.com/dash0hq/dash0-sdk-web/commit/20a7c23540497451abffcc5b3c7c771c19bba2da))

## [0.4.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.3.4...0.4.0) (2025-05-30)

### Features

- add support for custom events ([#17](https://github.com/dash0hq/dash0-sdk-web/issues/17)) ([51fa4d2](https://github.com/dash0hq/dash0-sdk-web/commit/51fa4d287cab9ecbadec99a3f69bed1735e4f41a))

## [0.3.4](https://github.com/dash0hq/dash0-sdk-web/compare/0.3.3...0.3.4) (2025-05-27)

### Bug Fixes

- support all user attributes on identify ([#16](https://github.com/dash0hq/dash0-sdk-web/issues/16)) ([e8e8e7d](https://github.com/dash0hq/dash0-sdk-web/commit/e8e8e7deec7fe61b8d01deda5561b5c44c577fb2))

## [0.3.3](https://github.com/dash0hq/dash0-sdk-web/compare/0.3.2...0.3.3) (2025-05-27)

### Bug Fixes

- **sdk:** Added compat helper to detect support for stacktraces in exceptions ([770c8e7](https://github.com/dash0hq/dash0-sdk-web/commit/770c8e722292afd94804f1b123a7a482d0626e05))
- **sdk:** Removed fragment assertion from tests ([db71703](https://github.com/dash0hq/dash0-sdk-web/commit/db717037491db46af752bfd57f79d9faa5d89c33))

## [0.3.2](https://github.com/dash0hq/dash0-sdk-web/compare/0.3.1...0.3.2) (2025-05-22)

## [0.3.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.3.0...0.3.1) (2025-05-21)

### Bug Fixes

- properly support array attributes ([#14](https://github.com/dash0hq/dash0-sdk-web/issues/14)) ([61cf57b](https://github.com/dash0hq/dash0-sdk-web/commit/61cf57b5cbf4e503393d0c3af9b746002b38a81f))

## [0.3.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.2.0...0.3.0) (2025-05-20)

### Features

- custom attributes ([#12](https://github.com/dash0hq/dash0-sdk-web/issues/12)) ([3f45cdd](https://github.com/dash0hq/dash0-sdk-web/commit/3f45cddfaaf787ab60654655a958a35d281c745c))

## [0.2.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.1.3...0.2.0) (2025-05-20)

### Features

- url attributes on events ([#11](https://github.com/dash0hq/dash0-sdk-web/issues/11)) ([abca409](https://github.com/dash0hq/dash0-sdk-web/commit/abca4091f1f06b09fa99226e0c94dbb22ca55afa))

## [0.1.3](https://github.com/dash0hq/dash0-sdk-web/compare/0.1.2...0.1.3) (2025-05-20)

### Bug Fixes

- run e2e tests with lambdatest ([#10](https://github.com/dash0hq/dash0-sdk-web/issues/10)) ([d400810](https://github.com/dash0hq/dash0-sdk-web/commit/d400810e3822c7d0098f579e71d53ad8b0939975))

## [0.1.2](https://github.com/dash0hq/dash0-sdk-web/compare/0.1.1...0.1.2) (2025-05-13)

### Bug Fixes

- types export to point to the correct file ([#9](https://github.com/dash0hq/dash0-sdk-web/issues/9)) ([faa766b](https://github.com/dash0hq/dash0-sdk-web/commit/faa766ba976deff017ca017a39003ae8b54b2ea8))

## [0.1.1](https://github.com/dash0hq/dash0-sdk-web/compare/0.1.0...0.1.1) (2025-05-06)

### Bug Fixes

- clarify traceparent header value and set right trace flags ([#8](https://github.com/dash0hq/dash0-sdk-web/issues/8)) ([c5ef4da](https://github.com/dash0hq/dash0-sdk-web/commit/c5ef4da2175a2c7ff29366d9a32c507d1959a30a))

## [0.1.0](https://github.com/dash0hq/dash0-sdk-web/compare/0.0.8...0.1.0) (2025-05-05)

### Features

- fetch instrumentation ([#5](https://github.com/dash0hq/dash0-sdk-web/issues/5)) ([06dc689](https://github.com/dash0hq/dash0-sdk-web/commit/06dc6896461c7578a798d1ea3c8b1b8d6685bd6f))

## [0.0.8](https://github.com/dash0hq/dash0-sdk-web/compare/0.0.7...0.0.8) (2025-04-30)

### Bug Fixes

- small attribute improvements ([#6](https://github.com/dash0hq/dash0-sdk-web/issues/6)) ([21061b4](https://github.com/dash0hq/dash0-sdk-web/commit/21061b4db41931de1b8cfa5083fc6b28b033402f))

## [0.0.7](https://github.com/dash0hq/dash0-sdk-web/compare/0.0.6...0.0.7) (2025-04-29)

### Bug Fixes

- **semantic-conventions:** update attribute key to align with the network semantic conventions ([c368b38](https://github.com/dash0hq/dash0-sdk-web/commit/c368b382ef402e917b2913c36ff6db6cec26d381))

## [0.0.6](https://github.com/dash0hq/dash0-sdk-web/compare/0.0.5...0.0.6) (2025-04-24)

### Bug Fixes

- include build version ([8ead7fb](https://github.com/dash0hq/dash0-sdk-web/commit/8ead7fb800814d1f77bea3a0de8ebc29eb96267c))

## [0.0.5](https://github.com/dash0hq/dash0-sdk-web/compare/0.0.4...0.0.5) (2025-04-23)

### Bug Fixes

- avoid double init calls and dont explode on unexpected event handler conditions ([97c2fff](https://github.com/dash0hq/dash0-sdk-web/commit/97c2fff9c80d2a2cb76afd384e8a73ab8126762d))
- lazy init rate limiter ([0425068](https://github.com/dash0hq/dash0-sdk-web/commit/0425068993af6648a94d96ab9ae284cdeeff806d))

## [0.0.4](https://github.com/dash0hq/dash0-sdk-web/compare/0.0.2...0.0.4) (2025-04-23)

### Bug Fixes

- caught another unprotected use of window ([7a73416](https://github.com/dash0hq/dash0-sdk-web/commit/7a73416cce27883e831869ba134b1f702e93e697))
- gracefully handle being imported in ssr context ([048785e](https://github.com/dash0hq/dash0-sdk-web/commit/048785ed946d800f7ebb8b1c95774abe1a66ddb8))

## [0.0.2](https://github.com/dash0hq/dash0-sdk-web/compare/0.0.1...0.0.2) (2025-04-23)
