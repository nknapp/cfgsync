import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";
import { getTestDir } from "./lib/setupTestDir.ts";

Deno.test("symlinks-are-preserved-during-sync-forward", async (t) => {
  const testDir = getTestDir(t).pathname;

  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | file content",
      `user:user |      | source/symlink-absolute.txt -> ${testDir}target/file.txt`,
      `user:user |      | source/symlink-relative.txt -> file.txt`,
      `user:user |      | source/symlink-relative2.txt -> ./file.txt`,
      "user:user | 0755 | target/",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | file content",
    `user:user |      | source/symlink-absolute.txt -> ${testDir}target/file.txt`,
    `user:user |      | source/symlink-relative.txt -> file.txt`,
    `user:user |      | source/symlink-relative2.txt -> ./file.txt`,
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | file content",
    `user:user |      | target/symlink-absolute.txt -> ${testDir}target/file.txt`,
    `user:user |      | target/symlink-relative.txt -> file.txt`,
    `user:user |      | target/symlink-relative2.txt -> ./file.txt`,
  ]);
});

Deno.test("symlinks-are-preserved-during-sync-backwards", async (t) => {
  const testDir = getTestDir(t).pathname;

  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0755 | target/",
      "user:user | 0644 | target/file.txt | file content",
      `user:user |      | target/symlink-absolute.txt -> ${testDir}source/file.txt`,
      `user:user |      | target/symlink-relative.txt -> file.txt`,
      `user:user |      | target/symlink-relative2.txt -> ./file.txt`,
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | file content",
    `user:user |      | source/symlink-absolute.txt -> ${testDir}source/file.txt`,
    `user:user |      | source/symlink-relative.txt -> file.txt`,
    `user:user |      | source/symlink-relative2.txt -> ./file.txt`,
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | file content",
    `user:user |      | target/symlink-absolute.txt -> ${testDir}source/file.txt`,
    `user:user |      | target/symlink-relative.txt -> file.txt`,
    `user:user |      | target/symlink-relative2.txt -> ./file.txt`,
  ]);
});

Deno.test("symlink-target-change-is-synced", async (t) => {
  const testDir = getTestDir(t).pathname;

  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      "user:user | 0644 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/one.txt | first",
      `user:user |      | source/symlink.txt -> one.txt`,
      "user:user | 0644 | source/two.txt | second",
      "user:user | 0755 | target/",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });

  await Deno.remove(`${testDir}source/symlink.txt`);
  await Deno.symlink("two.txt", `${testDir}source/symlink.txt`);

  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0644 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/one.txt | first",
    "user:user |      | source/symlink.txt -> two.txt",
    "user:user | 0644 | source/two.txt | second",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/one.txt | first",
    "user:user |      | target/symlink.txt -> two.txt",
    "user:user | 0644 | target/two.txt | second",
  ]);
});
