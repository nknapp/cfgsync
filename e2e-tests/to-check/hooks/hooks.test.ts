import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("hooks-basic-execution", async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | file content",
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
    `=== file.txt (source -> target) ===\n` +
      `--- ${testDir}/source/file.txt\t2020-01-01 00:00:00.000000000 +0000\n` +
      `+++ ${testDir}/target/file.txt\n` +
      `@@ -1 +1 @@\n` +
      `-file content\n` +
      `\\ No newline at end of file\n` +
      `+(file missing)\n` +
      `\\ No newline at end of file`,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      running hook: touch ./target/hook-ran

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
    "user:user | 644 | 0 | source/file.txt | file content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | file content",
    "user:user | 644 | 0 | target/hook-ran | ",
  ]);
});
