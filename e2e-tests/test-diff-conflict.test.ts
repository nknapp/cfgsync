import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("diff-conflict-shows-unified-diff", async (t) => {
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
      "user:user | 0644  | source/conflict.txt | line 1\nline 2\nline 3 source\n",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/conflict.txt | line 1\nline 2\nline 3 target\n",
    ],
  });

  await testbed.run({ args: ["diff", "config.toml"] });
  testbed.assertOutput({
    code: 0,
    stderr: "",
    stdout: deindent`
      === conflict.txt (CONFLICT) ===
      @@ -1,3 +1,3 @@
       line 1
       line 2
      -line 3 source
      +line 3 target
    `,
  });
});
