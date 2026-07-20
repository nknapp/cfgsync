import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("multi-group-independent", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source-a"
      target = "./target-a"
      globs = ["**/*.txt"]

      [[sync]]
      source = "./source-b"
      target = "./target-b"
      globs = ["**/*.conf"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source-a/",
      "user:user | 644 | 0 | source-a/file.txt | content from group a",
      "user:user | 755 | 0 | target-a/",
      "user:user | 755 | 0 | source-b/",
      "user:user | 644 | 0 | source-b/file.conf | content from group b",
      "user:user | 755 | 0 | target-b/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  // Status and diff
  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      2→
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 2
      target -> source: 0
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "diff"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      === file.txt (source -> target) ===
      --- ${testDir}/source-a/file.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
      +++ ${testDir}/target-a/file.txt${"\t"}
      @@ -1 +1 @@
      -content from group a
      \ No newline at end of file
      +(file missing)
      \ No newline at end of file
      
      === file.conf (source -> target) ===
      --- ${testDir}/source-b/file.conf${"\t"}2020-01-01 00:00:00.000000000 +0000
      +++ ${testDir}/target-b/file.conf${"\t"}
      @@ -1 +1 @@
      -content from group b
      \ No newline at end of file
      +(file missing)
      \ No newline at end of file`,
    stderr: "",
  });

  // First sync: both groups copy to target
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      copied file.conf -> target

      source -> target: 2
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source-a/",
    "user:user | 644 | 0 | source-a/file.txt | content from group a",
    "user:user | 755 | 0 | source-b/",
    "user:user | 644 | 0 | source-b/file.conf | content from group b",
    "user:user | 755 | 0 | target-a/",
    "user:user | 644 | 0 | target-a/file.txt | content from group a",
    "user:user | 755 | 0 | target-b/",
    "user:user | 644 | 0 | target-b/file.conf | content from group b",
  ]);
});
