import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("multi-group-overlap-error", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target-a"
      globs = ["**/*"]

      [[sync]]
      source = "./source"
      target = "./target-b"
      globs = ["**/*"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/shared.conf | shared content",
      "user:user | 0755  | target-a/",
      "user:user | 0755  | target-b/",
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
