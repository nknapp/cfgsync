import { assertEquals, deindent, TestBed } from "@/lib/index.ts";

Deno.test("new-file-copy-to-target", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | hello\n",
      "user:user | 755 | 0 | target/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  // status: file only on source side, no state → CopyToTarget
  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 0
    `,
    stderr: "",
  });

  // TODO: Test short status

  // diff: unified diff showing source content added to (missing) target
  await testbed.run({ args: ["--config", "config.toml", "diff"], env: { TZ: "UTC" } });
  testbed.assertOutput({
    code: 0,
    // deindent's trimEnd() strips the trailing tab on the +++ line when the
    // target file is missing (no timestamp), so construct the expected stdout
    // manually for this section.
    stdout: `=== file.txt (source -> target) ===\n` +
      `--- ${testDir}/source/file.txt\t2020-01-01 00:00:00.000000000 +0000\n` +
      `+++ ${testDir}/target/file.txt\t\n` +
      `@@ -1 +1 @@\n` +
      `-hello\n` +
      `+(file missing)\n` +
      `\\ No newline at end of file`,
    stderr: "",
  });

  // sync: copies source → target, creates state file
  testbed.advance("1 sec");
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  // After sync: both files exist with same content, state file created
  assertEquals(await testbed.readTestDir(), [
    "user:user | 644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | hello\n",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | hello\n",
  ]);
});
