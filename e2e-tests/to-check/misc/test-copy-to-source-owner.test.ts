import {
  assertEquals,
  CONFIG_TOML,
  deindent,
  runningOutsideDocker,
  STATE_FILE,
  TestBed,
} from "@/lib/index.ts";

Deno.test({
  name: "copy-to-source-respects-config-owner",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
      owner = "root:root"
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | target/",
      "root:root | 644 | 0 | target/file.txt | target-only file",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });

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

  assertEquals(await testbed.readTestDir(), [
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "root:root | 644 | 0 | source/file.txt | target-only file",
    "user:user | 755 | 0 | target/",
    "root:root | 644 | 0 | target/file.txt | target-only file",
  ]);
});
