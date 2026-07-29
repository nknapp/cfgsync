import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("nonroot-permission-warning", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.conf"]
      file_perms = "private"
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.conf | my config",
      "user:user | 755 | 0 | target/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.testStatus("config.toml", {
    short: deindent`
      1→
    `,
    normal: deindent`
      source -> target: 1
      target -> source: 0
    `,
  });

  await testbed.testDiff(
    "config.toml",
    `=== file.conf (source -> target) ===\n` +
      `--- ${testDir}/source/file.conf\t2020-01-01 00:00:00.000000000 +0000\n` +
      `+++ ${testDir}/target/file.conf\n` +
      `@@ -1 +1 @@\n` +
      `-my config\n` +
      `\\ No newline at end of file\n` +
      `+(file missing)\n` +
      `\\ No newline at end of file`,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied file.conf -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.conf | my config",
    "user:user | 755 | 0 | target/",
    "user:user | 600 | 0 | target/file.conf | my config",
  ]);
});
