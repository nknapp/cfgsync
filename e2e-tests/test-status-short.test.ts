import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("status-short", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | new file",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/other.txt | target file",
    ],
  });

  await testbed.run({ args: ["status", "--short", "config.toml"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      1→ 1←
    `,
    stderr: "",
  });
});
