import { assertEquals, deindent } from "../lib/index.ts";
import { TestBed } from "../lib/TestBed.ts";

const pastDate = new Date("2020-01-01T00:00:00Z");

Deno.test("both-exist-conflict", async (t) => {
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
      "user:user | 0644  | source/file.txt | v1",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await testbed.writeTextFile("source/file.txt", "source v2");
  await testbed.setMtime("source/file.txt", pastDate);
  await testbed.writeTextFile("target/file.txt", "target v2");
  await testbed.setMtime("target/file.txt", pastDate);

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      conflict:         1
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      1↯
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "diff"] });
  const diffOutput = testbed.getStdout();
  if (!diffOutput.includes("=== file.txt (CONFLICT) ===")) {
    throw new Error(
      `Expected diff to contain "=== file.txt (CONFLICT) ===" but got: ${diffOutput}`,
    );
  }

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Conflicts detected (1 files):
        file.txt
      Error: Aborting due to 1 conflict(s). Use -i/--interactive to resolve.
    `,
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source v2",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | target v2",
  ]);
});
