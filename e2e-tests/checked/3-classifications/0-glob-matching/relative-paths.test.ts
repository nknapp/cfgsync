import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("relative-paths", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "../target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | subdir/",
      `user:user | 644 | 0 | subdir/config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | subdir/source/",
      "user:user | 644 | 0 | subdir/source/same.txt | identical content",
      "user:user | 755 | 0 | target/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  // Status shows pending copy before sync
  await testbed.run({ args: ["--config", "subdir/config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 0
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "subdir/config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      1→
    `,
    stderr: "",
  });

  // Diff shows pending change with relative paths resolved absolutely.
  // The target file doesn't exist yet, so its mtime is empty (trailing tab).
  await testbed.run({ args: ["--config", "subdir/config.toml", "diff"] });
  testbed.assertOutput({
    code: 0,
    stdout:
      deindent`
        === same.txt (source -> target) ===
        --- ${testDir}/subdir/source/same.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
        +++ ${testDir}/target/same.txt
        @@ -1 +1 @@
        -identical content
        \ No newline at end of file
        +(file missing)
        \ No newline at end of file
      `,
    stderr: "",
  });

  // Sync copies the file
  await testbed.run({ args: ["--config", "subdir/config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied same.txt -> target

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
    "user:user | 755 | 0 | subdir/source/",
    "user:user | 644 | 0 | subdir/source/same.txt | identical content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/same.txt | identical content",
  ]);
});
