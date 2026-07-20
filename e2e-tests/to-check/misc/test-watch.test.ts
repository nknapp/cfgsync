import { assertEquals } from "@/lib/assert.ts";
import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("watch-sync-on-change", async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | original content",
      "user:user | 755 | 0 | target/",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });
  try {
    // Wait for the initial sync to complete
    await child.waitForStderr("source -> target", { timeoutMillis: 5000 });

    await sleep(2000);
    await testbed.writeTextFile("source/file.txt", "modified content");
    await child.waitForStderr("source -> target", { minCount: 2, timeoutMillis: 5000 });

    assertEquals(await testbed.readTestDir(), [
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | modified content",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | modified content",
    ]);
  } finally {
    child.stop();
  }
});

Deno.test("watch-sync-on-delete", async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | hello",
      "user:user | 755 | 0 | target/",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });
  try {
    // Wait for the initial sync to complete
    await child.waitForStderr("source -> target", { timeoutMillis: 5000 });
    await sleep(2000);

    await testbed.deleteFile("source/file.txt");

    await child.waitForStderr("source -> target", { minCount: 2, timeoutMillis: 5000 });

    assertEquals(await testbed.readTestDir(), [
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | target/",
    ]);
  } finally {
    child.stop();
  }
});

Deno.test("watch-sync-new-file", async (t) => {
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
      "user:user | 755 | 0 | target/",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });
  try {
    await sleep(1000);
    await testbed.writeTextFile("source/new-file.txt", "new file content");
    await testbed.mkdir("source/subdir");
    await testbed.writeTextFile("source/subdir/new-file-2.txt", "new file content 2");
    await child.waitForStderr("source -> target", { minCount: 1, timeoutMillis: 5000 });

    await sleep(100);

    assertEquals(await testbed.readTestDir(), [
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/new-file.txt | new file content",
      "user:user | 755 | 0 | source/subdir/",
      "user:user | 644 | 0 | source/subdir/new-file-2.txt | new file content 2",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/new-file.txt | new file content",
      "user:user | 755 | 0 | target/subdir/",
      "user:user | 644 | 0 | target/subdir/new-file-2.txt | new file content 2",
    ]);
  } finally {
    child.stop();
  }
});

Deno.test("watch-empty-dir", async (t) => {
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
      "user:user | 755 | 0 | source/subdir/",
      "user:user | 755 | 0 | target/",
      "user:user | 755 | 0 | target/subdir/",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });

  try {
    await sleep(1000);
    await testbed.writeTextFile("source/subdir/new-file.txt", "contents");

    await child.waitForStderr("source -> target", { minCount: 1, timeoutMillis: 5000 });
    await sleep(1000);

    assertEquals(await testbed.readTestDir(), [
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | source/subdir/",
      "user:user | 644 | 0 | source/subdir/new-file.txt | contents",
      "user:user | 755 | 0 | target/",
      "user:user | 755 | 0 | target/subdir/",
      "user:user | 644 | 0 | target/subdir/new-file.txt | contents",
    ]);
  } finally {
    child.stop();
  }
});

Deno.test("do-not-watch-too-much", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["subdir/subsub/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | source/subdir/",
      "user:user | 755 | 0 | source/subdir/subsub/",
      "user:user | 755 | 0 | source/subdir/other-dir/",
      "user:user | 755 | 0 | target/",
      "user:user | 755 | 0 | target/subdir/",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });

  try {
    await sleep(1000);
    await testbed.writeTextFile("source/subdir/other-dir/new-file.txt", "contents");
    await sleep(2000);
    assertEquals(
      child.stderr.text,
      deindent`
        Running initial sync!
        Done!
    `,
    );
  } finally {
    child.stop();
  }
});
