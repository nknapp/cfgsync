import { assertEquals, CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("both-exist-copy-to-source", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | v1",
      "user:user | 755 | 0 | target/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.advance("1 sec");
  await testbed.writeTextFile("target/file.txt", "v2");

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 1
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      1←
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "diff"] });
  const diffOutput = testbed.getStdout();
  if (!diffOutput.includes("=== file.txt (target -> source) ===")) {
    throw new Error(
      `Expected diff to contain "=== file.txt (target -> source) ===" but got: ${diffOutput}`,
    );
  }

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied target -> file.txt

      source -> target: 0
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | v2",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | v2",
  ]);
});
