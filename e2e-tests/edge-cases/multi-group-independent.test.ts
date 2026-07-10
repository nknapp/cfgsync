import { assertEquals, deindent } from "../lib/index.ts";
import { TestBed } from "../lib/TestBed.ts";

Deno.test("multi-group-independent-status", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./src1"
      target = "./tgt1"
      globs = ["*.conf"]

      [[sync]]
      source = "./src2"
      target = "./tgt2"
      globs = ["*.txt"]
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | src1/",
      "user:user | 0644 | 0 | src1/nginx.conf | server { }",
      "user:user | 0755 | 0 | tgt1/",
      "user:user | 0755 | 0 | src2/",
      "user:user | 0644 | 0 | src2/app.txt | hello world",
      "user:user | 0755 | 0 | tgt2/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 2
      target -> source: 0
    `,
    stderr: "",
  });
});

Deno.test("multi-group-independent-sync", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./src1"
      target = "./tgt1"
      globs = ["*.conf"]

      [[sync]]
      source = "./src2"
      target = "./tgt2"
      globs = ["*.txt"]
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | src1/",
      "user:user | 0644 | 0 | src1/nginx.conf | server { }",
      "user:user | 0755 | 0 | tgt1/",
      "user:user | 0755 | 0 | src2/",
      "user:user | 0644 | 0 | src2/app.txt | hello world",
      "user:user | 0755 | 0 | tgt2/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied nginx.conf -> target
      copied app.txt -> target

      source -> target: 2
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | 0 | src1/",
    "user:user | 0644 | 0 | src1/nginx.conf | server { }",
    "user:user | 0755 | 0 | src2/",
    "user:user | 0644 | 0 | src2/app.txt | hello world",
    "user:user | 0755 | 0 | tgt1/",
    "user:user | 0644 | 0 | tgt1/nginx.conf | server { }",
    "user:user | 0755 | 0 | tgt2/",
    "user:user | 0644 | 0 | tgt2/app.txt | hello world",
  ]);

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
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
});
