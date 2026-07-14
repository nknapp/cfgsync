import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("relative-paths", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "../target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | subdir/",
      "user:user | 755 | 0 | subdir/config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | subdir/source/",
      "user:user | 644 | 0 | subdir/source/same.txt | identical content",
      "user:user | 755 | 0 | target/",
    ],
  });
  await testbed.run({ args: ["--config", "subdir/config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 755 | 0 | subdir/",
    "user:user | 644 | 0 | subdir/config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 755 | 0 | subdir/config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | subdir/source/",
    "user:user | 644 | 0 | subdir/source/same.txt | identical content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/same.txt | identical content",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied same.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
