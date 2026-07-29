import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("both-exist-copy-to-target", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | v1",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | v1",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");
  await testbed.writeTextFile("source/file.txt", "v2");

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
    === file.txt (source -> target) ===
    --- ${testDir}/source/file.txt${"\t"}2020-01-01 00:00:01.000000000 +0000
    +++ ${testDir}/target/file.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
    @@ -1 +1 @@
    -v2
    \ No newline at end of file
    +v1
    \ No newline at end of file
  `,
  );

  await testbed.testSync("config.toml", {
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

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | v2",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | v2",
  ]);
});
