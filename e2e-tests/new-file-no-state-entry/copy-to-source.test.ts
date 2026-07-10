import { assertEquals, deindent } from "../lib/index.ts";
import { getTestDir } from "../lib/setupTestDir.ts";
import { TestBed } from "../lib/TestBed.ts";

const knownDate = new Date("2020-01-01T00:00:00Z");

Deno.test("new-file-copy-to-source", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/file.txt | from target\n",
    ],
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

  // diff: unified diff showing target content added to (missing) source
  const testDir = getTestDir(t);
  await testbed.setMtime("target/file.txt", knownDate);

  await testbed.run({ args: ["--config", "config.toml", "diff"], env: { TZ: "UTC" } });
  testbed.assertOutput({
    code: 0,
    // deindent's trimEnd() strips the trailing tab on the +++ line when the
    // source file is missing (no timestamp), so construct the expected stdout
    // manually for this section.
    stdout: `=== file.txt (target -> source) ===\n` +
      `--- ${testDir.pathname}target/file.txt\t2020-01-01 00:00:00.000000000 +0000\n` +
      `+++ ${testDir.pathname}source/file.txt\t\n` +
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
  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | from target\n",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | from target\n",
  ]);
});
