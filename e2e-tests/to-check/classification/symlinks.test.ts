import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("symlinks-are-preserved-during-sync-forward", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, ({ testDir }) => ({
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | file content",
      `user:user |     | 0 | source/symlink-absolute.txt -> ${testDir}/target/file.txt`,
      `user:user |     | 0 | source/symlink-relative.txt -> file.txt`,
      `user:user |     | 0 | source/symlink-relative2.txt -> ./file.txt`,
      "user:user | 755 | 0 | target/",
    ],
  }));

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | file content",
    `user:user |     | 0 | source/symlink-absolute.txt -> ${testDir}/target/file.txt`,
    `user:user |     | 0 | source/symlink-relative.txt -> file.txt`,
    `user:user |     | 0 | source/symlink-relative2.txt -> ./file.txt`,
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | file content",
    `user:user |     | 0 | target/symlink-absolute.txt -> ${testDir}/target/file.txt`,
    `user:user |     | 0 | target/symlink-relative.txt -> file.txt`,
    `user:user |     | 0 | target/symlink-relative2.txt -> ./file.txt`,
  ]);
});

Deno.test("symlinks-are-preserved-during-sync-backwards", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, ({ testDir }) => ({
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | file content",
      `user:user |      | 0 | target/symlink-absolute.txt -> ${testDir}/source/file.txt`,
      `user:user |      | 0 | target/symlink-relative.txt -> file.txt`,
      `user:user |      | 0 | target/symlink-relative2.txt -> ./file.txt`,
    ],
  }));

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | file content",
    `user:user |      | 0 | source/symlink-absolute.txt -> ${testDir}/source/file.txt`,
    `user:user |      | 0 | source/symlink-relative.txt -> file.txt`,
    `user:user |      | 0 | source/symlink-relative2.txt -> ./file.txt`,
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | file content",
    `user:user |      | 0 | target/symlink-absolute.txt -> ${testDir}/source/file.txt`,
    `user:user |      | 0 | target/symlink-relative.txt -> file.txt`,
    `user:user |      | 0 | target/symlink-relative2.txt -> ./file.txt`,
  ]);
});

Deno.test("symlink-target-change-is-synced", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/one.txt | first",
      `user:user |      | 0 | source/symlink.txt -> one.txt`,
      "user:user | 644 | 0 | source/two.txt | second",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await new Promise((r) => setTimeout(r, 10));
  await Deno.remove(`${testDir}/source/symlink.txt`);
  await Deno.symlink("two.txt", `${testDir}/source/symlink.txt`);

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/one.txt | first",
    "user:user |      | 0 | source/symlink.txt -> two.txt",
    "user:user | 644 | 0 | source/two.txt | second",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/one.txt | first",
    "user:user |      | 0 | target/symlink.txt -> two.txt",
    "user:user | 644 | 0 | target/two.txt | second",
  ]);
});
