# Changelog

## [Unreleased](https://github.com/nknapp/cfgsync/compare/v0.2.9...fb15c294cced4210da131a704d10a5567003838c) (2026-05-27)

### Features

* add --verbose flag showing files visited
([fb15c29](https://github.com/nknapp/cfgsync/commit/fb15c294cced4210da131a704d10a5567003838c))

### [v0.2.9](https://github.com/nknapp/cfgsync/compare/v0.2.8...v0.2.9) (2026-05-26)

#### Features

* add --short flag to status command
([a55999f](https://github.com/nknapp/cfgsync/commit/a55999f1944b3c95e7e10d6840a461c3f239f795))
* add --version parameter
([e78edac](https://github.com/nknapp/cfgsync/commit/e78edacd8d5da460844e059d84fa69cde7bf656d))

#### Fixes

* add content check again
([521bb7d](https://github.com/nknapp/cfgsync/commit/521bb7d8259776b8d7ed8183d2f15376a437ac15))

### [v0.2.8](https://github.com/nknapp/cfgsync/compare/v0.2.7...v0.2.8) (2026-05-26)

#### Performance Improvements

* only descend in to matching directories
([8577c49](https://github.com/nknapp/cfgsync/commit/8577c49e65f52a88f688e63c94da880c6e951541))

### [v0.2.7](https://github.com/nknapp/cfgsync/compare/v0.2.6...v0.2.7) (2026-05-25)

#### Fixes

* **e2e-test:** fix test for mac
([b2508f8](https://github.com/nknapp/cfgsync/commit/b2508f89421f5ab6708d86b599b773a3651a87ff))

### [v0.2.6](https://github.com/nknapp/cfgsync/compare/v0.2.5...v0.2.6) (2026-05-25)

#### Fixes

* **e2e:** fix e2e tests
([f3b249b](https://github.com/nknapp/cfgsync/commit/f3b249bef378f427f1769704f45a231127bc7fcd))

### [v0.2.5](https://github.com/nknapp/cfgsync/compare/v0.2.4...v0.2.5) (2026-05-25)

#### Fixes

* **e2e-test:** fix test
([9c2c905](https://github.com/nknapp/cfgsync/commit/9c2c905f2b0ea590e571510edcb177bf9b95644e))

### [v0.2.4](https://github.com/nknapp/cfgsync/compare/v0.2.3...v0.2.4) (2026-05-25)

#### Fixes

* **status:** only check date when comparing files for status
([ff6a681](https://github.com/nknapp/cfgsync/commit/ff6a6819ba8764f34bbcb7b681c4943b05b582ca))

### [v0.2.3](https://github.com/nknapp/cfgsync/compare/v0.2.2...v0.2.3) (2026-05-25)

#### Fixes

* **ci:** run e2e-tests after using the final builds
([b06efc2](https://github.com/nknapp/cfgsync/commit/b06efc20a44e1b8ac62643670ae435ebbee89c03))

### [v0.2.2](https://github.com/nknapp/cfgsync/compare/v0.2.1...v0.2.2) (2026-05-25)

#### Fixes

* **ci:** add contents:write to call-release permissions
([c0c9d7f](https://github.com/nknapp/cfgsync/commit/c0c9d7f0453bfb4f4b24aca7f3bf841650581b06))
* **ci:** fix workflows
([7d047ff](https://github.com/nknapp/cfgsync/commit/7d047ff9af88e361acfc7d8de2985387b3b251e9))

### [v0.2.1](https://github.com/nknapp/cfgsync/compare/v0.2.0...v0.2.1) (2026-05-25)

#### Fixes

* **ci:** release directly after bump
([b44855b](https://github.com/nknapp/cfgsync/commit/b44855b23b78892a96b9e4808444c64b4e6699ce))

## v0.2.0 (2026-05-25)

### Fixes

* **ci:** set github identity
([b4852cc](https://github.com/nknapp/cfgsync/commit/b4852ccc8192d0c283c4875f2d0b64e156a66917))
* **ci:** fix bump task
([b329205](https://github.com/nknapp/cfgsync/commit/b329205cb1a7fa3506dceb00157ffbfb7742c136))
* **ci:** fix bump task
([39501ed](https://github.com/nknapp/cfgsync/commit/39501ed46e1ea189e8e7b6c5cd68948daadd2e02))
* **ci:** add mise action to bump-version
([ff1ddc2](https://github.com/nknapp/cfgsync/commit/ff1ddc228042c495195e82b1a4be93773f336a23))
* **ci:** pin versions, fix workflow
([7cec101](https://github.com/nknapp/cfgsync/commit/7cec1018f2436ebadd786f300ab43e2b5f32de11))
* **ci:** use profile=default for rust install
([0d82491](https://github.com/nknapp/cfgsync/commit/0d82491781b24be5c7496d65144a543af1168ec0))
* **ci:** update use rust default profile in ci
([d775748](https://github.com/nknapp/cfgsync/commit/d775748ae415a20e4d33da6851531ab919a03e5d))
* add github attestation
([1901b15](https://github.com/nknapp/cfgsync/commit/1901b15be9d7bb144b7b8913320fd2b5e7ae79cb))
* **ci:** fix workflow file
([130b542](https://github.com/nknapp/cfgsync/commit/130b542f192480f8c2c19c7852eb15002bf00550))
