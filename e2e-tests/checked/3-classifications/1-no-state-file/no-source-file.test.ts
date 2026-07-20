import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("new-file-copy-to-source", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | from target\n",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  // status: file only on target side, no state → CopyToSource
  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 1
    `,
    stderr: "",
  });

  // TODO: test short status

  // diff: unified diff showing target content added to (missing) source
  await testbed.run({ args: ["--config", "config.toml", "diff"] });
  testbed.assertOutput({
    code: 0,
    // deindent's trimEnd() strips the trailing tab on the +++ line when the
    // source file is missing (no timestamp), so construct the expected stdout
    // manually for this section.
    stdout: `=== file.txt (target -> source) ===\n` +
      `--- ${testDir}/target/file.txt\t2020-01-01 00:00:00.000000000 +0000\n` +
      `+++ ${testDir}/source/file.txt\t\n` +
      `@@ -1 +1 @@\n` +
      `-from target\n` +
      `+(file missing)\n` +
      `\\ No newline at end of file`,
    stderr: "",
  });

  // sync: copies target → source, creates state file
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
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

  // After sync: both files exist with same content, state file created
  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | from target\n",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | from target\n",
  ]);
});
