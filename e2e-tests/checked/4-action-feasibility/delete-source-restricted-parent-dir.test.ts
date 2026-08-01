import {
  CONFIG_TOML,
  deindent,
  rootOwner,
  runningOutsideDocker,
  STATE_FILE,
  TestBed,
} from "@/lib/index.ts";

Deno.test({
  name: "delete-source-restricted-parent-dir",
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
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | hello",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.chown("source", rootOwner);
  await testbed.deleteFile("target/file.txt");

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
      Warning: skipping 'file.txt': cannot delete '${testDir}/source/file.txt' (insufficient permissions on parent directory)
    `,
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    `${rootOwner} | 755 | 0 | source/`,
    "user:user | 644 | 0 | source/file.txt | hello",
    "user:user | 755 | 0 | target/",
  ]);
});
