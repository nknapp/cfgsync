import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("sync-symlink-forward", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    faketime: "2020-01-01T00:00:00Z",
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user |     | 0 | source/link.txt -> hello",
      "user:user | 755 | 0 | target/",
    ],
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
    deindent`
    === link.txt (source -> target) ===
    --- ${testDir}/source/link.txt${"\t"}
    +++ ${testDir}/target/link.txt${"\t"}
    `,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied link.txt -> target

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
    "user:user |     | 0 | source/link.txt -> hello",
    "user:user | 755 | 0 | target/",
    "user:user |     | 0 | target/link.txt -> hello",
  ]);
});
