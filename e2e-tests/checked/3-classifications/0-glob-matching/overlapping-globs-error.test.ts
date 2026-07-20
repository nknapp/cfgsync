import { CONFIG_TOML, deindent, TestBed } from "@/lib/index.ts";

Deno.test("overlapping-globs-status-error", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./tgt-a"
      globs = ["**/*"]

      [[sync]]
      source = "./source"
      target = "./tgt-b"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/shared.conf | shared file",
      "user:user | 755 | 0 | tgt-a/",
      "user:user | 755 | 0 | tgt-b/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Error: File 'shared.conf' matches globs in both sync group 1 and sync group 2. Each file must belong to exactly one group.
    `,
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Error: File 'shared.conf' matches globs in both sync group 1 and sync group 2. Each file must belong to exactly one group.
    `,
  });

  await testbed.run({ args: ["--config", "config.toml", "diff"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Error: File 'shared.conf' matches globs in both sync group 1 and sync group 2. Each file must belong to exactly one group.
    `,
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Error: File 'shared.conf' matches globs in both sync group 1 and sync group 2. Each file must belong to exactly one group.
    `,
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/shared.conf | shared file",
    "user:user | 755 | 0 | tgt-a/",
    "user:user | 755 | 0 | tgt-b/",
  ]);
});
