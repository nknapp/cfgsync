import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

const pastDate = new Date("2020-01-01T00:00:00Z");

Deno.test("status-unchanged-content", async (t) => {
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
      "user:user | 0644  | source/file.txt | same content",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/file.txt | same content",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await testbed.setMtime("source/file.txt", pastDate);

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
      "user:user | 0644  | source/file.txt | original content",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/file.txt | original content",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await testbed.writeTextFile("source/file.txt", "modified content");
  await testbed.setMtime("source/file.txt", pastDate);

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
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      permissions = "644"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | original content",
      "user:user | 0755  | target/",
      "user:user | 0600  | target/file.txt | original content",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  await testbed.setMtime("target/file.txt", pastDate);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 0
    `,
    stderr: "",
  });
});
