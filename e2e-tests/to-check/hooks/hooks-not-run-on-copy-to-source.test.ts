import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("hooks-not-run-on-copy-to-source", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./target/hook-ran" }
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | target only content",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.testStatus("config.toml", {
    short: deindent`
      1←
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 1
    `,
  });

  await testbed.testDiff(
    "config.toml",
    `=== file.txt (target -> source) ===\n` +
      `--- ${testDir}/target/file.txt\t2020-01-01 00:00:00.000000000 +0000\n` +
      `+++ ${testDir}/source/file.txt\n` +
      `@@ -1 +1 @@\n` +
      `-target only content\n` +
      `\\ No newline at end of file\n` +
      `+(file missing)\n` +
      `\\ No newline at end of file`,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied target -> file.txt

      source -> target: 0
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | target only content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | target only content",
  ]);
});
