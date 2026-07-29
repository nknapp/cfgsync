import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("ignore-non-matching", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["*.txt"]
    `,
    faketime: "2020-01-01T00:00:00Z",
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source file content",
      "user:user | 644 | 0 | source/not-matched.conf | should not be synced",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/unmatched-target.txt | target file content",
      "user:user | 644 | 0 | target/not-matched.conf | should not be synced",
    ],
  });

  await testbed.testStatus("config.toml", {
    short: deindent`
      1→ 1←
    `,
    normal: deindent`
      source -> target: 1
      target -> source: 1
    `,
  });

  await testbed.testDiff(
    "config.toml",
    deindent`
    === file.txt (source -> target) ===
    --- ${testDir}/source/file.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
    +++ ${testDir}/target/file.txt${"\t"}
    @@ -1 +1 @@
    -source file content
    \ No newline at end of file
    +(file missing)
    \ No newline at end of file

    === unmatched-target.txt (target -> source) ===
    --- ${testDir}/target/unmatched-target.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
    +++ ${testDir}/source/unmatched-target.txt${"\t"}
    @@ -1 +1 @@
    -target file content
    \ No newline at end of file
    +(file missing)
    \ No newline at end of file`,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      copied target -> unmatched-target.txt

      source -> target: 1
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
    "user:user | 644 | 0 | source/file.txt | source file content",
    "user:user | 644 | 0 | source/not-matched.conf | should not be synced",
    "user:user | 644 | 0 | source/unmatched-target.txt | target file content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | source file content",
    "user:user | 644 | 0 | target/not-matched.conf | should not be synced",
    "user:user | 644 | 0 | target/unmatched-target.txt | target file content",
  ]);
});
