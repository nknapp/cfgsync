import {
  assertEquals,
  CONFIG_TOML,
  deindent,
  runningOutsideDocker,
  STATE_FILE,
  TestBed,
} from "@/lib/index.ts";

Deno.test({
  name: "hook-runs-as-configured-owner",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "root:root"
      hooks = { after = "whoami > ./target/hook-owner-marker" }
      globs = ["**/*.txt"]
    `,
    files: [
      `root:root | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | file content",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      running hook: whoami > ./target/hook-owner-marker

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    `root:root | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `root:root | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | file content",
    "user:user | 755 | 0 | target/",
    "root:root | 644 | 0 | target/file.txt | file content",
    "root:root | 644 | 0 | target/hook-owner-marker | root\n",
  ]);
});
