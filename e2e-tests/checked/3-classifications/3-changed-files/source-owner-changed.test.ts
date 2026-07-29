import {
  CONFIG_TOML,
  deindent,
  rootOwner,
  runningOutsideDocker,
  STATE_FILE,
  TestBed,
} from "@/lib/index.ts";

Deno.test({
  name: "source-owner-changed-copy-to-target",
  ignore: runningOutsideDocker,
}, async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | hello",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  const configWithOwner = deindent`
    [[sync]]
    source = "./source"
    target = "./target"
    owner = "${rootOwner}"
    globs = ["**/*.txt"]
  `;
  await Deno.writeTextFile(`${testDir}/config2.toml`, configWithOwner);
  await Deno.copyFile(
    `${testDir}/config.cfgsync.state`,
    `${testDir}/config2.cfgsync.state`,
  );
  testbed.advance("1 sec");
  await testbed.writeTextFile("source/file.txt", "v2");

  await testbed.run({ args: ["--config", "config2.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 0
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config2.toml", "sync"], sudo: true });
  testbed.assertOutput({
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

  await Deno.remove(`${testDir}/config2.toml`);
  await Deno.remove(`${testDir}/config2.cfgsync.state`);

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | v2",
    "user:user | 755 | 0 | target/",
    `root:root | 644 | 0 | target/file.txt | v2`,
  ]);
});
