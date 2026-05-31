import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";
import { getTestDir } from "./lib/setupTestDir.ts";

Deno.test("copy data to absolute target path", async (t) => {
  const absoluteBaseDir = getTestDir(t).pathname.replace(/\/$/, "");

  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source/"
      target = "${absoluteBaseDir}/target"
      globs = [".subdir/**/*"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0755 | source/.subdir/",
      "user:user | 0755 | source/.subdir/subsub/",
      "user:user | 0644 | source/.subdir/subsub/new.txt | newfile",
      "user:user | 0755 | target/",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0755 | source/.subdir/",
    "user:user | 0755 | source/.subdir/subsub/",
    "user:user | 0644 | source/.subdir/subsub/new.txt | newfile",
    "user:user | 0755 | target/",
    "user:user | 0755 | target/.subdir/",
    "user:user | 0755 | target/.subdir/subsub/",
    "user:user | 0644 | target/.subdir/subsub/new.txt | newfile",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied .subdir/subsub/new.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
