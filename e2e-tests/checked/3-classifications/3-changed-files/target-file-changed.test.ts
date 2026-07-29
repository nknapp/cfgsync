import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("both-exist-copy-to-source", async (t) => {
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
  await testbed.writeTextFile("target/file.txt", "v2");

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
    deindent`
    === file.txt (target -> source) ===
    --- ${testDir}/target/file.txt${"\t"}2020-01-01 00:00:01.000000000 +0000
    +++ ${testDir}/source/file.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
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
    "user:user | 644 | 0 | source/file.txt | v2",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | v2",
  ]);
});
