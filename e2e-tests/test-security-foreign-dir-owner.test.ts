import { deindent, runningOutsideDocker } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test({
  name: "security-foreign-dir-owner",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | source/foreign-dir/",
      "user:user | 644 | 0 | source/foreign-dir/file.txt | hello",
      "root:root | 777 | 0 | target/",
      "root:root | 777 | 0 | target/foreign-dir/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Warning: skipping 'foreign-dir/file.txt' (target parent directory is owned by another user, set explicit owner to override)
    `,
  });
});
