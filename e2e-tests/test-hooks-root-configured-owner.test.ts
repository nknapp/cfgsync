import { assertEquals, deindent, runningOutsideDocker } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";
import { getTestDir } from "./lib/setupTestDir.ts";

Deno.test({
  name: "hook-runs-as-configured-owner",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "root:root"
      hooks = { after = "whoami > ./target/hook-owner-marker" }
      globs = ["**/*.txt"]
    `,
    files: [
      "root:root | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | file content",
      "user:user | 0755  | target/",
    ],
  });

  const configPath = new URL("config.toml", testDir);
  await new Deno.Command("sudo", {
    args: ["chown", "root:root", configPath.pathname],
    stdout: "null",
    stderr: "null",
  }).output();

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      running hook: whoami > ./target/hook-owner-marker

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "root:root | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "root:root | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | file content",
    "user:user | 0755 | target/",
    "root:root | 0644 | target/file.txt | file content",
    "root:root | 0644 | target/hook-owner-marker | root\n",
  ]);
});
