import { CONFIG_TOML, deindent, runningOutsideDocker, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test({
  name: "source-parent-dir-not-creatable",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "root:root | 555 | 0 | source/",
      "user:user | 755 | 0 | target/",
      "user:user | 755 | 0 | target/subdir/",
      "user:user | 644 | 0 | target/subdir/file.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.testStatus("config.toml", {
    short: deindent`
      ✗1
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 0
      failed:           1
    `,
  });

  await testbed.testSudoSync("config.toml", {
    code: 0,
    stdout: deindent`

      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Warning: skipping 'subdir/file.txt': cannot create parent directory '${testDir}/source/subdir' (no write+execute permission on '${testDir}/source')
    `,
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "root:root | 555 | 0 | source/",
    "user:user | 755 | 0 | target/",
    "user:user | 755 | 0 | target/subdir/",
    "user:user | 644 | 0 | target/subdir/file.txt | hello",
  ]);
});
