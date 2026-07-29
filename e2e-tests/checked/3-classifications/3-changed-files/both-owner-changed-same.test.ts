import {
  CONFIG_TOML,
  deindent,
  rootOwner,
  runningOutsideDocker,
  STATE_FILE,
  TestBed,
} from "@/lib/index.ts";

Deno.test({
  name: "both-owner-changed-same-update-state",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
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
      "user:user | 644 | 0 | source/file.txt | hello",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");
  await testbed.chown("source/file.txt", rootOwner);
  await testbed.chown("target/file.txt", rootOwner);

  await testbed.testStatus("config.toml", {
    short: deindent`
      ↺1
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 0
      state update:     1
    `,
  });

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      source -> target: 0
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
    `root:root | 644 | 0 | source/file.txt | hello`,
    "user:user | 755 | 0 | target/",
    `root:root | 644 | 0 | target/file.txt | hello`,
  ]);
});
