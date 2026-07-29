# Changelog

## [v0.6.12](https://github.com/nknapp/cfgsync/compare/v0.6.11...835ac0ed58f57ca94a35ba260c68a2d0d5fde804) (2026-07-29)

### Fixes

* skip perms/owner check in is_changed when mtime matches state
([9cb1906](https://github.com/nknapp/cfgsync/commit/9cb19069dc185a5d6fffc4ebf15e1621196e1ba0))

### [v0.6.11](https://github.com/nknapp/cfgsync/compare/v0.6.10...v0.6.11) (2026-07-29)

#### Fixes

* use configured owner/perms for source in no-state-file classification
([16c1e42](https://github.com/nknapp/cfgsync/commit/16c1e42285351f550fa349b2250718e0e0bcfc49))

### [v0.6.10](https://github.com/nknapp/cfgsync/compare/v0.6.9...v0.6.10) (2026-07-29)

#### Fixes

* enforce copy-to-source validation per updated algorithm
([ab56342](https://github.com/nknapp/cfgsync/commit/ab563428774f718c8092107b2af25278df79aff3))
* use testbed methods instead of state file manipulation in e2e tests
([26172e8](https://github.com/nknapp/cfgsync/commit/26172e8d95e4481c3d128e08d04ca1209ee4095a))
* skip state-not-updated-after-warning test outside docker
([322b07d](https://github.com/nknapp/cfgsync/commit/322b07d72c537e81589172bc46f9207aa5328235))
* track owner and perms changes in file classification
([27805f5](https://github.com/nknapp/cfgsync/commit/27805f53d2b4a278b7467d83c3668909f5a5bad9))

### [v0.6.9](https://github.com/nknapp/cfgsync/compare/v0.6.8...v0.6.9) (2026-07-28)

#### Fixes

* apply target file permissions after copy, address review comments
([28e3277](https://github.com/nknapp/cfgsync/commit/28e3277d84e9895b12bd1171f02ac0c3b3e65104))
* validate owner feasibility before copy, skip copy when owner cannot be set
([0d9260a](https://github.com/nknapp/cfgsync/commit/0d9260ada535321949d1b095557c6a336545a7b3))

### [v0.6.8](https://github.com/nknapp/cfgsync/compare/v0.6.7...v0.6.8) (2026-07-28)

#### Fixes

* validate owner format, require user:group and reject user-only specs
([1ef6b8c](https://github.com/nknapp/cfgsync/commit/1ef6b8c8f95cba88ab1ce94f04444a3f34ebf7cd))
* use root (no group) in test owner specs for macOS compatibility
([9e819b2](https://github.com/nknapp/cfgsync/commit/9e819b2189ea7de94f8562b4a9dcee61886eadb6))
* only emit owner/permission warnings for files that are actually copied
([de4277e](https://github.com/nknapp/cfgsync/commit/de4277e06850d0257b945dec0607869ebc4b4581))

### [v0.6.7](https://github.com/nknapp/cfgsync/compare/v0.6.6...v0.6.7) (2026-07-28)

#### Fixes

* address review comments — remove redundant tests, use run over spawn,
simplify AGENTS.md
([9bcdf0a](https://github.com/nknapp/cfgsync/commit/9bcdf0a0e7abfad13af0dd69abd92c5b726f9f28))
* treat explicit owner as authorization, bypassing security checks
([665b420](https://github.com/nknapp/cfgsync/commit/665b420e69526b66c6d64fe31bc3560fd0733a94))

### [v0.6.6](https://github.com/nknapp/cfgsync/compare/v0.6.5...v0.6.6) (2026-07-20)

#### Fixes

* replace destination symlinks before copy to support type changes
([459a004](https://github.com/nknapp/cfgsync/commit/459a004de1a2e4588e62cb0828b2c52f50f756f1))

### [v0.6.5](https://github.com/nknapp/cfgsync/compare/v0.6.4...v0.6.5) (2026-07-20)

#### Features

* **state:** track file type (symlink vs regular file) in state entries
([8134904](https://github.com/nknapp/cfgsync/commit/813490475a3f663f300b81cd190b54782b3d9072))

### [v0.6.4](https://github.com/nknapp/cfgsync/compare/v0.6.3...v0.6.4) (2026-07-20)

#### Fixes

* **sync:** do not update state for skipped conflicts
([4981123](https://github.com/nknapp/cfgsync/commit/4981123a27d77f6eb562d22420cb263e6e017016))

### [v0.6.3](https://github.com/nknapp/cfgsync/compare/v0.6.2...v0.6.3) (2026-07-19)

#### Fixes

* set state file modification time after writing
([b2bc1f2](https://github.com/nknapp/cfgsync/commit/b2bc1f20d85dde8a52ba92fe5e2a2c6ffa702b24))

### [v0.6.2](https://github.com/nknapp/cfgsync/compare/v0.6.1...v0.6.2) (2026-07-14)

#### Features

* bin/git-commit-and-push creates PR if none exists
([3e62861](https://github.com/nknapp/cfgsync/commit/3e62861c00085a252acfb5da0a440c06da7bd04a))
* close algorithm spec gap — implement steps 4-5 and all missing validations
([073d5e7](https://github.com/nknapp/cfgsync/commit/073d5e7c684ee08f2c76d4c2e8bac7d88c60523a))

#### Fixes

* address PR review — drop 0o prefix in perms warnings, root:root target dir
([e501719](https://github.com/nknapp/cfgsync/commit/e501719d088e6b008a0053f7f16794504b1b0a70))
* simplify deviating e2e tests for cross-platform compat
([cf6a820](https://github.com/nknapp/cfgsync/commit/cf6a8208ce71583a308aeb658f6f573b6a8f0098))
* wrap foreign-dir check in bypass and relax source parent existence check
([7fa3cd1](https://github.com/nknapp/cfgsync/commit/7fa3cd14aaf7176cc736c1401a5149f18727634e))
* remove unused testDir vars in deviating e2e tests
([3ae8e91](https://github.com/nknapp/cfgsync/commit/3ae8e9102024f0390944e582a9d6f00666bf9cd0))
* make deviating dir e2e tests cross-platform
([f63058b](https://github.com/nknapp/cfgsync/commit/f63058b1c021a8743b65520a0adf7d372b7ddc61))
* resolve CI lint and e2e test issues
([264c457](https://github.com/nknapp/cfgsync/commit/264c45713f3bfc354cf95d4415fef87641e6650e))

### [v0.6.1](https://github.com/nknapp/cfgsync/compare/v0.6.0...v0.6.1) (2026-07-11)

#### Features

* add version preview job to PR workflow
([d04fce4](https://github.com/nknapp/cfgsync/commit/d04fce4625caf31c1535acfe59b1bef97e820f2b))

#### Fixes

* use grouped redirect and fetch-tags in version-preview
([561912a](https://github.com/nknapp/cfgsync/commit/561912adef13f01cd40ec9e6f12a7de3c830c0e9))

## [v0.6.0](https://github.com/nknapp/cfgsync/compare/v0.5.1...v0.6.0) (2026-07-11)

### Features

* Implement new configuration scheme
([49bd0bc](https://github.com/nknapp/cfgsync/commit/49bd0bc9b6c98ea3f39a712ea20d01056f990ecb))
* dir_permissions and using hashes for comparison
([641168d](https://github.com/nknapp/cfgsync/commit/641168dc9a9542340ec93546689daaa32a4e562f))

### Fixes

* compute file hash from contents only per updated spec
([2de5ea2](https://github.com/nknapp/cfgsync/commit/2de5ea219b9c015ad7b2b3b51d3527a3e78cef9d))
* make e2e binary discovery cross-platform (macOS support)
([a3cf64d](https://github.com/nknapp/cfgsync/commit/a3cf64d2c62d1fce3adb61f4f69c47caf3e6b073))
* include perms and owner in content hash
([e0d6373](https://github.com/nknapp/cfgsync/commit/e0d63736ed036b3bdb4a8f7b0b310efc5e6f38a7))

### [v0.5.1](https://github.com/nknapp/cfgsync/compare/v0.5.0...v0.5.1) (2026-07-07)

#### Fixes

* show sync status for permissions to be changed.
([677b1d6](https://github.com/nknapp/cfgsync/commit/677b1d6f91748055581a739363d1e77745586726))

## [v0.5.0](https://github.com/nknapp/cfgsync/compare/v0.4.2...v0.5.0) (2026-06-17)

### ⚠ BREAKING CHANGE

* groups with `owner` configured now always trigger a
security confirmation (or warning in non-interactive mode), even when
the config file owner has write access to the target directory.


### Fixes

* groups with owner configured always require security confirmation
([1161de0](https://github.com/nknapp/cfgsync/commit/1161de0ff603571e183701c250921a52d143ff77))
* tmp
([36663fe](https://github.com/nknapp/cfgsync/commit/36663fe5152ed6a77b50696a65c85c3ad17e6357))

### [v0.4.2](https://github.com/nknapp/cfgsync/compare/v0.4.1...v0.4.2) (2026-06-17)

#### Features

* security confirmation for privileged write operations
([7999aa5](https://github.com/nknapp/cfgsync/commit/7999aa5a4e5d20ff60652a0aeca93880ac025204))

### [v0.4.1](https://github.com/nknapp/cfgsync/compare/v0.4.0...v0.4.1) (2026-06-17)

#### Features

* build static executables on Linux
([cf008dc](https://github.com/nknapp/cfgsync/commit/cf008dcc2238eb316ee112cd818306f4616cf5a9))
* add "sync.hooks.after" as config option
([c368f12](https://github.com/nknapp/cfgsync/commit/c368f129506dba24dde9f64c65bbd76b781e063f))

#### Fixes

* restore ARM64 musl cross-compilation deps and fix echo -n portability
([0007d4d](https://github.com/nknapp/cfgsync/commit/0007d4ddac1ea8780b02426ed7740c58fd34a3f8))

## [v0.4.0](https://github.com/nknapp/cfgsync/compare/v0.3.6...v0.4.0) (2026-06-12)

### Features

* move config file to option parameters
([ca9cc2b](https://github.com/nknapp/cfgsync/commit/ca9cc2bb3670d3280871c56de16f7b4bf438ee70))

### [v0.3.6](https://github.com/nknapp/cfgsync/compare/v0.3.5...v0.3.6) (2026-06-02)

#### Fixes

* optimize watch mode to only watch glob-matching directories
([9fc0dba](https://github.com/nknapp/cfgsync/commit/9fc0dba908aff229e605560ef8691d53fb561bce))

### [v0.3.5](https://github.com/nknapp/cfgsync/compare/v0.3.4...v0.3.5) (2026-06-02)

#### Fixes

* remove redundant watch_tree invocations in watch mode
([5bda4bc](https://github.com/nknapp/cfgsync/commit/5bda4bcc35519591919427eb4307edd9ac191ca7))

### [v0.3.4](https://github.com/nknapp/cfgsync/compare/v0.3.3...v0.3.4) (2026-06-01)

#### Features

* add `--watch` flag to sync command for continuous file watching
([1b5d830](https://github.com/nknapp/cfgsync/commit/1b5d83092693e45f1a13b5d78f113ae1b172f9f0))

### [v0.3.3](https://github.com/nknapp/cfgsync/compare/v0.3.2...v0.3.3) (2026-05-31)

#### Fixes

* adjust example config to use schema from githubusercontents
([be1b9ff](https://github.com/nknapp/cfgsync/commit/be1b9ff9633b9729ca991ff0d4eb2b338f087940))

### [v0.3.2](https://github.com/nknapp/cfgsync/compare/v0.3.1...v0.3.2) (2026-05-31)

#### Features

* expand tilde in sync source/target paths to owner's home directory
([67d1b82](https://github.com/nknapp/cfgsync/commit/67d1b826cfdf839930196b86b89d77b740c71c84))
* show file modification timestamps in diff output
([310bd02](https://github.com/nknapp/cfgsync/commit/310bd02569e7ef1b20de93cdebd4ea0f6c6ff614))

#### Fixes

* clarify and swap interactive conflict resolution key order
([62d679a](https://github.com/nknapp/cfgsync/commit/62d679a00ef8f8eb8df13e2661842531707cac40))
* handle symbolic links
([2d0636d](https://github.com/nknapp/cfgsync/commit/2d0636d9e5d293e62088ad78d709c011008be57a))

### [v0.3.1](https://github.com/nknapp/cfgsync/compare/v0.3.0...v0.3.1) (2026-05-31)

#### Features

* add `--debug` flag to show detailed scan information
([00cb0be](https://github.com/nknapp/cfgsync/commit/00cb0be9383fdef929e3f77afd4fdeb53f4ab926))

## [v0.3.0](https://github.com/nknapp/cfgsync/compare/v0.2.15...v0.3.0) (2026-05-30)

### Features

* preserve source file ownership when syncing to source
([47397a4](https://github.com/nknapp/cfgsync/commit/47397a4468346f3b8fec283442176d47d956b5cd))
* new configuration format allowing multiple groups per config
([3fb65a4](https://github.com/nknapp/cfgsync/commit/3fb65a4ac790c2a6e1391439a847372535ca8b13))

### Fixes

* use gid() instead of uid() for group ID mapping
([d8f0d45](https://github.com/nknapp/cfgsync/commit/d8f0d45e8e064042fffaac477893718520cae6f6))
* try to fix pipeline
([527bf42](https://github.com/nknapp/cfgsync/commit/527bf4207842aca027b2705749cc457193611dd4))
* chown state file to match config file owner instead of root
([16182a2](https://github.com/nknapp/cfgsync/commit/16182a23352d77f204fe0b2993017c0fa65ecb55))

### [v0.2.15](https://github.com/nknapp/cfgsync/compare/v0.2.14...v0.2.15) (2026-05-29)

#### Fixes

* dynamically map current uid/gid to 'user' in e2e tests
([1469e55](https://github.com/nknapp/cfgsync/commit/1469e556cbbe2286a0702170dc5ddf95e3de12ff))

### [v0.2.14](https://github.com/nknapp/cfgsync/compare/v0.2.13...v0.2.14) (2026-05-29)

#### Fixes

* resolve relative CFGSYNC path to absolute in run.sh
([91e6ff2](https://github.com/nknapp/cfgsync/commit/91e6ff2bbf91bc2f211c3eb5e42860e2553e2871))

### [v0.2.13](https://github.com/nknapp/cfgsync/compare/v0.2.12...v0.2.13) (2026-05-29)

#### Fixes

* handle chown PermissionDenied on non-root environments
([e4e573b](https://github.com/nknapp/cfgsync/commit/e4e573b0de28d69beef86b07a300d78049dc3e87))

### [v0.2.12](https://github.com/nknapp/cfgsync/compare/v0.2.11...v0.2.12) (2026-05-29)

#### Fixes

* restore e2e test runner for CI pipeline
([f0a12ed](https://github.com/nknapp/cfgsync/commit/f0a12ed44f31c4bd9f8bafb06021f39ca3ece806))

### [v0.2.11](https://github.com/nknapp/cfgsync/compare/v0.2.10...v0.2.11) (2026-05-29)

#### Fixes

* deterministic output of copied files in stdout
([1622383](https://github.com/nknapp/cfgsync/commit/1622383bb03b666e7499324caa66c90ee6d8095e))

### [v0.2.10](https://github.com/nknapp/cfgsync/compare/v0.2.9...v0.2.10) (2026-05-26)

#### Features

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
