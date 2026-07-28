import {
  assertEquals,
  CONFIG_TOML,
  deindent,
  runningOutsideDocker,
  STATE_FILE,
  TestBed,
} from "@/lib/index.ts";

// Bypass: root-owned config, not group/other-writable → no security
Deno.test({
  name: "security-bypass-root-owned-config",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `root:root | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source content",
      "root:root | 755 | 0 | target/",
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

  await testbed.assertTestDir([
    `root:root | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `root:root | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "root:root | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | source content",
  ]);
});

// Bypass: not running as root → no security
Deno.test({
  name: "security-bypass-non-root",
}, async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | source content",
      "user:user | 755 | 0 | target/",
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

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | source content",
  ]);
});

// Error+skip: no owner configured, config owner can't write to target dir
Deno.test({
  name: "security-error-skip-cannot-write-dir",
  ignore: runningOutsideDocker,
}, async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | source content",
      "root:root | 755 | 0 | target/",
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

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "root:root | 755 | 0 | target/",
  ]);
});

// Hook: explicit owner → bypasses hook security, hook runs without prompt
Deno.test({
  name: "security-hook-owner-mismatch-yes",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "whoami > ./hook-ran" }
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source content",
      "user:user | 755 | 0 | target/",
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

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "root:root | 644 | 0 | hook-ran | root\n",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "user:user | 755 | 0 | target/",
    "root:root | 644 | 0 | target/file.txt | source content",
  ]);
});

// Hook: explicit owner → bypasses hook security, hook runs without prompt (no option to skip)
Deno.test({
  name: "security-hook-owner-mismatch-no",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./hook-ran" }
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source content",
      "user:user | 755 | 0 | target/",
    ],
  });

  const child = testbed.spawn({
    args: ["--config", "config.toml", "sync", "-i"],
    sudo: true,
  });
  const { code, stdout, stderr } = await child.waitForExit();

  assertEquals(
    stdout.trim(),
    "copied file.txt -> target\nrunning hook: touch ./hook-ran\n\n" +
      "source -> target: 1\n" +
      "target -> source: 0\ndeleted target:   0\ndeleted source:   0",
  );
  assertEquals(stderr, "");
  assertEquals(code, 0);

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "root:root | 644 | 0 | hook-ran | ",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "user:user | 755 | 0 | target/",
    "root:root | 644 | 0 | target/file.txt | source content",
  ]);
});

// Hook: explicit owner → bypasses hook security, hook runs without prompt (no option to quit from)
Deno.test({
  name: "security-hook-owner-mismatch-quit",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./hook-ran" }
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source content",
      "user:user | 755 | 0 | target/",
    ],
  });

  const child = testbed.spawn({
    args: ["--config", "config.toml", "sync", "-i"],
    sudo: true,
  });
  const { code, stdout, stderr } = await child.waitForExit();

  assertEquals(
    stdout.trim(),
    "copied file.txt -> target\nrunning hook: touch ./hook-ran\n\n" +
      "source -> target: 1\n" +
      "target -> source: 0\ndeleted target:   0\ndeleted source:   0",
  );
  assertEquals(stderr, "");
  assertEquals(code, 0);

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "root:root | 644 | 0 | hook-ran | ",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "user:user | 755 | 0 | target/",
    "root:root | 644 | 0 | target/file.txt | source content",
  ]);
});

// No hook security when no owner configured; verify hook runs as config owner
Deno.test({
  name: "security-hook-no-owner-runs-as-config-owner",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "whoami > ./hook-ran" }
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source content",
      "user:user | 755 | 0 | target/",
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

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 644 | 0 | hook-ran | user\n",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | source content",
  ]);
});

// Non-interactive: explicit owner → bypasses security, file is copied
Deno.test({
  name: "security-warning-non-interactive",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source content",
      "root:root | 755 | 0 | target/",
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

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "root:root | 755 | 0 | target/",
    "root:root | 644 | 0 | target/file.txt | source content",
  ]);
});

// Interactive: explicit owner → bypasses security, file is copied without prompt
Deno.test({
  name: "security-prompt-owner-yes",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source content",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync", "-i"], sudo: true });

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

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "user:user | 755 | 0 | target/",
    "root:root | 644 | 0 | target/file.txt | source content",
  ]);
});

// Interactive: explicit owner → bypasses security, file is copied (no prompt to skip)
Deno.test({
  name: "security-prompt-owner-no",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source content",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync", "-i"], sudo: true });

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

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source content",
    "user:user | 755 | 0 | target/",
    "root:root | 644 | 0 | target/file.txt | source content",
  ]);
});

// Interactive: explicit owner → bypasses security, file is copied (no prompt to quit from)
Deno.test({
  name: "security-prompt-owner-quit",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "root:root"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/a.txt | content a",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync", "-i"], sudo: true });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied a.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/a.txt | content a",
    "user:user | 755 | 0 | target/",
    "root:root | 644 | 0 | target/a.txt | content a",
  ]);
});
