import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("multi-group-independent", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./src-a"
      target = "./tgt-a"
      globs = ["**/*.txt"]

      [[sync]]
      source = "./src-b"
      target = "./tgt-b"
      globs = ["**/*.conf"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | src-a/",
      "user:user | 0644  | src-a/readme.txt | hello from a",
      "user:user | 0755  | tgt-a/",
      "user:user | 0755  | src-b/",
      "user:user | 0644  | src-b/app.conf | port = 443",
      "user:user | 0755  | tgt-b/",
    ],
  });

  // First sync: both groups copy to target
  await testbed.run({ args: ["sync", "config.toml"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied readme.txt -> target
      copied app.conf -> target

      source -> target: 2
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  // Second sync: nothing changed
  await testbed.run({ args: ["sync", "config.toml"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | src-a/",
    "user:user | 0644 | src-a/readme.txt | hello from a",
    "user:user | 0755 | src-b/",
    "user:user | 0644 | src-b/app.conf | port = 443",
    "user:user | 0755 | tgt-a/",
    "user:user | 0644 | tgt-a/readme.txt | hello from a",
    "user:user | 0755 | tgt-b/",
    "user:user | 0644 | tgt-b/app.conf | port = 443",
  ]);
});
