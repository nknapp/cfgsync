import {
  CONFIG_TOML,
  deindent,
  rootOwner,
  runningOutsideDocker,
  STATE_FILE,
  TestBed,
} from "@/lib/index.ts";

Deno.test({
  name: "target-owner-changed-copy-to-source",
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
  await testbed.chown("target/file.txt", rootOwner);

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 1
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      1←
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
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
    `user:user | 644 | 0 | source/file.txt | hello`,
    "user:user | 755 | 0 | target/",
    `root:root | 644 | 0 | target/file.txt | hello`,
  ]);
});
