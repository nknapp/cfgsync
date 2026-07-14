import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("status-unchanged-content", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | same content",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | same content",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.advance("1 sec");
  await testbed.writeTextFile("source/file.txt", "same content");

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
    `,
    stderr: "",
  });

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

Deno.test("status-unchanged-content-actual-change-detected", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | original content",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | original content",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.advance("1 sec");
  await testbed.writeTextFile("source/file.txt", "modified content");

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 0
    `,
    stderr: "",
  });
});

Deno.test("status-unchanged-content-changed-perms", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      file_perms = "public"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | original content",
      "user:user | 755 | 0 | target/",
      "user:user | 600 | 0 | target/file.txt | original content",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

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
});
