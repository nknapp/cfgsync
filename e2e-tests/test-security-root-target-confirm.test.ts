import { assertEquals, deindent, runningOutsideDocker } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

// Bypass: root-owned config, not group/other-writable → no security
Deno.test({
  name: "security-bypass-root-owned-config",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "root:root | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source content",
      "root:root | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });

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
    "root:root | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "root:root | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source content",
    "root:root | 0755 | target/",
    "user:user | 0644 | target/file.txt | source content",
  ]);
});

// Bypass: not running as root → no security
Deno.test({
  name: "security-bypass-non-root",
}, async (t) => {
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
      "user:user | 0644  | source/file.txt | source content",
      "user:user | 0755  | target/",
    ],
  });

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
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source content",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | source content",
  ]);
});

// Error+skip: no owner configured, config owner can't write to target dir
Deno.test({
  name: "security-error-skip-cannot-write-dir",
  ignore: runningOutsideDocker,
}, async (t) => {
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
      "user:user | 0644  | source/file.txt | source content",
      "root:root | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`

      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Error: cannot copy 'file.txt' to target (config file owner lacks write permission)
    `,
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source content",
    "root:root | 0755 | target/",
  ]);
});

// Hook security: owner differs, user confirms, verify hook runs as configured owner
Deno.test({
  name: "security-hook-owner-mismatch-yes",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "whoami > ./hook-ran" }
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source content",
      "user:user | 0755  | target/",
    ],
  });

  const child = testbed.spawn({
    args: ["--config", "config.toml", "sync", "-i"],
    sudo: true,
  });

  await child.waitForStderr(
    /Security notice: running as root/,
  );
  await child.waitForStderr(
    /=== Security: privileged hook execution ===/,
  );
  await child.type("y\n");
  const { code, stdout } = await child.waitForExit();

  assertEquals(
    stdout.trim(),
    "copied file.txt -> target\nrunning hook: whoami > ./hook-ran\n\n" +
      "source -> target: 1\n" +
      "target -> source: 0\ndeleted target:   0\ndeleted source:   0",
  );
  assertEquals(code, 0);

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "root:root | 0644 | hook-ran | root\n",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source content",
    "user:user | 0755 | target/",
    "root:root | 0644 | target/file.txt | source content",
  ]);
});

// Hook security: owner differs, user skips
Deno.test({
  name: "security-hook-owner-mismatch-no",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./hook-ran" }
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source content",
      "user:user | 0755  | target/",
    ],
  });

  const child = testbed.spawn({
    args: ["--config", "config.toml", "sync", "-i"],
    sudo: true,
  });

  await child.waitForStderr(
    /Security notice: running as root/,
  );
  await child.waitForStderr(
    /=== Security: privileged hook execution ===/,
  );
  await child.type("n\n");
  const { code, stdout } = await child.waitForExit();

  assertEquals(
    stdout.trim(),
    "copied file.txt -> target\n\n" +
      "source -> target: 1\n" +
      "target -> source: 0\ndeleted target:   0\ndeleted source:   0\n" +
      "permission skips: 1",
  );
  assertEquals(code, 0);

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source content",
    "user:user | 0755 | target/",
    "root:root | 0644 | target/file.txt | source content",
  ]);
});

// Hook security: owner differs, user quits
Deno.test({
  name: "security-hook-owner-mismatch-quit",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./hook-ran" }
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source content",
      "user:user | 0755  | target/",
    ],
  });

  const child = testbed.spawn({
    args: ["--config", "config.toml", "sync", "-i"],
    sudo: true,
  });

  await child.waitForStderr(
    /Security notice: running as root/,
  );
  await child.waitForStderr(
    /=== Security: privileged hook execution ===/,
  );
  await child.type("q\n");
  const { code } = await child.waitForExit();

  assertEquals(code, 1);

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source content",
    "user:user | 0755 | target/",
    "root:root | 0644 | target/file.txt | source content",
  ]);
});

// No hook security when no owner configured; verify hook runs as config owner
Deno.test({
  name: "security-hook-no-owner-runs-as-config-owner",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "whoami > ./hook-ran" }
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source content",
      "user:user | 0755  | target/",
    ],
  });

  const child = testbed.spawn({
    args: ["--config", "config.toml", "sync", "-i"],
    sudo: true,
  });
  const { code, stdout, stderr } = await child.waitForExit();

  assertEquals(
    stdout.trim(),
    "copied file.txt -> target\nrunning hook: whoami > ./hook-ran\n\n" +
      "source -> target: 1\n" +
      "target -> source: 0\ndeleted target:   0\ndeleted source:   0",
  );
  assertEquals(stderr, "");
  assertEquals(code, 0);

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0644 | hook-ran | user\n",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source content",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | source content",
  ]);
});

// Non-interactive: WarnOrPrompt → warning + skip
Deno.test({
  name: "security-warning-non-interactive",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source content",
      "root:root | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`

      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Security warning: skipping 'file.txt' (privileged write, re-run with -i to confirm)
      Security notice: running as root with a config file not owned by root.
      Some operations require privileges the config file owner does not have.
      Re-run with -i/--interactive to confirm each privileged operation, or use a root-owned config.
    `,
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source content",
    "root:root | 0755 | target/",
  ]);
});
