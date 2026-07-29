import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("copy data to absolute target path", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, ({ testDir }) => ({
    configToml: deindent`
      [[sync]]
      source = "./source/"
      target = "${testDir}/target"
      globs = [".subdir/**/*"]
    `,
    faketime: "2020-01-01T00:00:00Z",
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | source/.subdir/",
      "user:user | 755 | 0 | source/.subdir/subsub/",
      "user:user | 644 | 0 | source/.subdir/subsub/new.txt | newfile",
      "user:user | 755 | 0 | target/",
    ],
  }));

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
    deindent`
    === .subdir/subsub/new.txt (source -> target) ===
    --- ${testDir}/source/.subdir/subsub/new.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
    +++ ${testDir}/target/.subdir/subsub/new.txt${"\t"}
    @@ -1 +1 @@
    -newfile
    \ No newline at end of file
    +(file missing)
    \ No newline at end of file`,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied .subdir/subsub/new.txt -> target

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
    "user:user | 755 | 0 | source/.subdir/",
    "user:user | 755 | 0 | source/.subdir/subsub/",
    "user:user | 644 | 0 | source/.subdir/subsub/new.txt | newfile",
    "user:user | 755 | 0 | target/",
    "user:user | 755 | 0 | target/.subdir/",
    "user:user | 755 | 0 | target/.subdir/subsub/",
    "user:user | 644 | 0 | target/.subdir/subsub/new.txt | newfile",
  ]);
});
