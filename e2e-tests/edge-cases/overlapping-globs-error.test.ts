import { deindent } from "../lib/index.ts";
import { TestBed } from "../lib/TestBed.ts";

Deno.test("overlapping-globs-status-error", async (t) => {
  const testbed = await TestBed.create(t, {
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
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/shared.conf | shared file",
      "user:user | 0755 | tgt-a/",
      "user:user | 0755 | tgt-b/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Error: File 'shared.conf' matches globs in both sync group 1 and sync group 2. Each file must belong to exactly one group.
    `,
  });
});

Deno.test("overlapping-globs-sync-error", async (t) => {
  const testbed = await TestBed.create(t, {
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
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/shared.conf | shared file",
      "user:user | 0755 | tgt-a/",
      "user:user | 0755 | tgt-b/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Error: File 'shared.conf' matches globs in both sync group 1 and sync group 2. Each file must belong to exactly one group.
    `,
  });
});
