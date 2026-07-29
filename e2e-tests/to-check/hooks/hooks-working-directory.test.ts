import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("hooks-working-directory-is-config-dir", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./hook-marker" }
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | subdir/",
      `user:user | 644 | 0 | subdir/config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | subdir/source/",
      "user:user | 644 | 0 | subdir/source/file.txt | file content",
      "user:user | 755 | 0 | subdir/target/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.testStatus("subdir/config.toml", {
    short: deindent`
      1→
    `,
    normal: deindent`
      source -> target: 1
      target -> source: 0
    `,
  });

  await testbed.testDiff(
    "subdir/config.toml",
    `=== file.txt (source -> target) ===\n` +
      `--- ${testDir}/subdir/source/file.txt\t2020-01-01 00:00:00.000000000 +0000\n` +
      `+++ ${testDir}/subdir/target/file.txt\n` +
      `@@ -1 +1 @@\n` +
      `-file content\n` +
      `\\ No newline at end of file\n` +
      `+(file missing)\n` +
      `\\ No newline at end of file`,
  );

  await testbed.testSync("subdir/config.toml", {
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      running hook: touch ./hook-marker

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  await testbed.assertTestDir([
    "user:user | 755 | 0 | subdir/",
    `user:user | 644 | 0 | subdir/config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | subdir/config.toml | ${CONFIG_TOML}`,
    "user:user | 644 | 0 | subdir/hook-marker | ",
    "user:user | 755 | 0 | subdir/source/",
    "user:user | 644 | 0 | subdir/source/file.txt | file content",
    "user:user | 755 | 0 | subdir/target/",
    "user:user | 644 | 0 | subdir/target/file.txt | file content",
  ]);
});
