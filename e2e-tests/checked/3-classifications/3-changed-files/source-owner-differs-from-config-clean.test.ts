import { CONFIG_TOML, deindent, rootOwner, runningOutsideDocker, TestBed } from "@/lib/index.ts";

Deno.test({
  name: "source-owner-differs-from-config-but-unchanged",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "${rootOwner}"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | hello",
      "user:user | 755 | 0 | target/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  // First sync: source -> target (CopyToTarget), target gets root:root owner
  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });
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

  // Nothing changed — status should be clean
  await testbed.testStatus("config.toml", {
    short: deindent`
      ✓
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 0
    `,
  });
});
