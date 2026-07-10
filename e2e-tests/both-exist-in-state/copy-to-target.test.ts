import { assertEquals, deindent } from "../lib/index.ts";
import { TestBed } from "../lib/TestBed.ts";

Deno.test("both-exist-copy-to-target", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0644 | 0 | source/file.txt | v1",
      "user:user | 0755 | 0 | target/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.advance("1 sec");
  await testbed.writeTextFile("source/file.txt", "v2");

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 0
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      1→
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "diff"] });
  const diffOutput = testbed.getStdout();
  if (!diffOutput.includes("=== file.txt (source -> target) ===")) {
    throw new Error(
      `Expected diff to contain "=== file.txt (source -> target) ===" but got: ${diffOutput}`,
    );
  }

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | 0 | source/",
    "user:user | 0644 | 0 | source/file.txt | v2",
    "user:user | 0755 | 0 | target/",
    "user:user | 0644 | 0 | target/file.txt | v2",
  ]);
});
