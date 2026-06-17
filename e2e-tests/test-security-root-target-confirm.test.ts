import { assertEquals, deindent, runningOutsideDocker } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";
import { getTestDir } from "./lib/setupTestDir.ts";

async function chownTargetToRoot(testDir: URL) {
  const targetDir = new URL("target/", testDir);
  const cmd = new Deno.Command("sudo", {
    args: ["chown", "root:root", targetDir.pathname],
    stdout: "null",
    stderr: "null",
  });
  await cmd.output();
}

async function chownFileToRoot(testDir: URL, relativePath: string) {
  const file = new URL(relativePath, testDir);
  const cmd = new Deno.Command("sudo", {
    args: ["chown", "root:root", file.pathname],
    stdout: "null",
    stderr: "null",
  });
  await cmd.output();
}

async function cleanupTestDir(testDir: URL) {
  const cmd = new Deno.Command("sudo", {
    args: ["rm", "-rf", testDir.pathname],
    stdout: "null",
    stderr: "null",
  });
  await cmd.output();
}

// Bypass: root-owned config, not group/other-writable → no security prompt
Deno.test({
  name: "security-bypass-root-owned-config",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
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

  try {
    await chownFileToRoot(testDir, "config.toml");
    await chownTargetToRoot(testDir);

    const child = testbed.spawn({
      args: ["--config", "config.toml", "sync"],
      sudo: true,
    });
    const { code, stdout, stderr } = await child.waitForExit();

    assertEquals(
      stdout.trim(),
      "copied file.txt -> target\n\nsource -> target: 1\n" +
        "target -> source: 0\ndeleted target:   0\ndeleted source:   0",
    );
    assertEquals(stderr, "");
    assertEquals(code, 0);

    assertEquals(await testbed.readTestDir(), [
      "root:root | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "root:root | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | source content",
      "root:root | 0755 | target/",
      "user:user | 0644 | target/file.txt | source content",
    ]);
  } finally {
    await cleanupTestDir(testDir);
  }
});

// Bypass: not running as root → no security prompt
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

// Security prompt: config owner can't write to target dir (new file)
Deno.test({
  name: "security-prompt-cannot-write-dir-yes",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
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

  try {
    await chownTargetToRoot(testDir);

    const child = testbed.spawn({
      args: ["--config", "config.toml", "sync", "-i"],
      sudo: true,
    });

    await child.waitForStderr(
      /Security notice: running as root/,
    );
    await child.waitForStderr(
      /=== Security: privileged write: file\.txt ===/,
    );
    await child.type("y\n");
    const { code, stdout } = await child.waitForExit();

    assertEquals(
      stdout.trim(),
      "copied file.txt -> target\n\nsource -> target: 1\n" +
        "target -> source: 0\ndeleted target:   0\ndeleted source:   0",
    );
    assertEquals(code, 0);

    assertEquals(await testbed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | source content",
      "root:root | 0755 | target/",
      "user:user | 0644 | target/file.txt | source content",
    ]);
  } finally {
    await cleanupTestDir(testDir);
  }
});

// Security prompt: config owner can't write to target dir, user says no
Deno.test({
  name: "security-prompt-cannot-write-dir-no",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
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

  try {
    await chownTargetToRoot(testDir);

    const child = testbed.spawn({
      args: ["--config", "config.toml", "sync", "-i"],
      sudo: true,
    });

    await child.waitForStderr(
      /Security notice: running as root/,
    );
    await child.waitForStderr(
      /=== Security: privileged write: file\.txt ===/,
    );
    await child.type("n\n");
    const { code, stdout } = await child.waitForExit();

    assertEquals(
      stdout.trim(),
      "source -> target: 0\ntarget -> source: 0\ndeleted target:   0\n" +
        "deleted source:   0\npermission skips: 1",
    );
    assertEquals(code, 0);

    assertEquals(await testbed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | source content",
      "root:root | 0755 | target/",
    ]);
  } finally {
    await cleanupTestDir(testDir);
  }
});

// Security prompt: config owner can't write to target dir, user quits
Deno.test({
  name: "security-prompt-cannot-write-dir-quit",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
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
      "user:user | 0644  | source/a.txt | content a",
      "user:user | 0755  | target/",
    ],
  });

  try {
    await chownTargetToRoot(testDir);

    const child = testbed.spawn({
      args: ["--config", "config.toml", "sync", "-i"],
      sudo: true,
    });

    await child.waitForStderr(
      /Security notice: running as root/,
    );
    await child.waitForStderr(
      /=== Security: privileged write: a\.txt ===/,
    );
    await child.type("q\n");
    const { code, stderr } = await child.waitForExit();

    assertEquals(code, 1);
    assertEquals(
      stderr.trim(),
      "Security notice: running as root with a config file not owned by root.\n" +
        "Some operations require privileges the config file owner does not have.\n" +
        "=== Security: privileged write: a.txt ===\n" +
        "@@ -1 +1 @@\n" +
        "-(file missing)\n" +
        "\\ No newline at end of file\n" +
        "+content a\n" +
        "\\ No newline at end of file\n" +
        "\n[y]es [n]o [q]uit: " +
        "Error: Aborted by user due to security confirmation.",
    );

    assertEquals(await testbed.readTestDir(), [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/a.txt | content a",
      "root:root | 0755 | target/",
    ]);
  } finally {
    await cleanupTestDir(testDir);
  }
});

// No security prompt: config owner can write to target dir
Deno.test({
  name: "security-no-prompt-can-write-dir",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
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

  try {
    const child = testbed.spawn({
      args: ["--config", "config.toml", "sync"],
      sudo: true,
    });
    const { code, stdout, stderr } = await child.waitForExit();

    assertEquals(
      stdout.trim(),
      "copied file.txt -> target\n\nsource -> target: 1\n" +
        "target -> source: 0\ndeleted target:   0\ndeleted source:   0",
    );
    assertEquals(stderr, "");
    assertEquals(code, 0);

    assertEquals(await testbed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | source content",
      "user:user | 0755 | target/",
      "user:user | 0644 | target/file.txt | source content",
    ]);
  } finally {
    await cleanupTestDir(testDir);
  }
});

// Security triggers for group-writable root-owned config
Deno.test({
  name: "security-triggered-group-writable-config",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0664  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source content",
      "user:user | 0755  | target/",
    ],
  });

  try {
    await chownFileToRoot(testDir, "config.toml");
    await chownTargetToRoot(testDir);

    const child = testbed.spawn({
      args: ["--config", "config.toml", "sync", "-i"],
      sudo: true,
    });

    await child.waitForStderr(
      /Security notice: running as root/,
    );
    await child.waitForStderr(
      /=== Security: privileged write: file\.txt ===/,
    );
    await child.type("y\n");
    const { code } = await child.waitForExit();

    assertEquals(code, 0);

    assertEquals(await testbed.readTestDir(), [
      "root:root | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "root:root | 0664 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | source content",
      "root:root | 0755 | target/",
      "user:user | 0644 | target/file.txt | source content",
    ]);
  } finally {
    await cleanupTestDir(testDir);
  }
});

// Hook security triggers when group owner != config owner
Deno.test({
  name: "security-hook-owner-mismatch-yes",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
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

  try {
    const child = testbed.spawn({
      args: ["--config", "config.toml", "sync", "-i"],
      sudo: true,
    });

    // File copies without security prompt (dir is writable by config owner)
    // Hook prompts for security
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
      "copied file.txt -> target\nrunning hook: touch ./hook-ran\n\n" +
        "source -> target: 1\n" +
        "target -> source: 0\ndeleted target:   0\ndeleted source:   0",
    );
    assertEquals(code, 0);

    assertEquals(await testbed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "root:root | 0644 | hook-ran | ",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | source content",
      "user:user | 0755 | target/",
      "root:root | 0644 | target/file.txt | source content",
    ]);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test({
  name: "security-hook-owner-mismatch-no",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
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

  try {
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
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test({
  name: "security-hook-owner-mismatch-quit",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
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

  try {
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
  } finally {
    await cleanupTestDir(testDir);
  }
});

// No hook security when group has no owner configured
Deno.test({
  name: "security-hook-no-owner-no-prompt",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./hook-ran" }
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source content",
      "user:user | 0755  | target/",
    ],
  });

  try {
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

    assertEquals(await testbed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0644 | hook-ran | ",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | source content",
      "user:user | 0755 | target/",
      "user:user | 0644 | target/file.txt | source content",
    ]);
  } finally {
    await cleanupTestDir(testDir);
  }
});

// Non-interactive: warning instead of prompt when config owner can't write to target
Deno.test({
  name: "security-warning-non-interactive",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testDir = getTestDir(t);
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./hook-ran" }
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source content",
      "user:user | 0755  | target/",
    ],
  });

  try {
    await chownTargetToRoot(testDir);

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
        Security notice: running as root with a config file not owned by root.
        Some operations require privileges the config file owner does not have.
        Re-run with -i/--interactive to confirm each privileged operation, or use a root-owned config.
        Security warning: skipping 'file.txt' (privileged write, re-run with -i to confirm)
      `,
    });

    assertEquals(await testbed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | source content",
      "root:root | 0755 | target/",
    ]);
  } finally {
    await cleanupTestDir(testDir);
  }
});
