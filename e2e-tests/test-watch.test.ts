import { deindent } from "./lib/index.ts";
import { assertEquals } from "./lib/assert.ts";
import { TestBed } from "./lib/TestBed.ts";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("watch-sync-on-change", async (t) => {
  const testBed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | original content",
      "user:user | 0755 | target/",
    ],
  });

  const child = testBed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });
  try {
    // Wait for the initial sync to complete
    await child.waitForStderr("source -> target", { timeoutMillis: 5000 });

    await sleep(2000);
    await testBed.writeTextFile("source/file.txt", "modified content");
    await child.waitForStderr("source -> target", { minCount: 2, timeoutMillis: 5000 });

    assertEquals(await testBed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | modified content",
      "user:user | 0755 | target/",
      "user:user | 0644 | target/file.txt | modified content",
    ]);
  } finally {
    child.stop();
  }
});

Deno.test("watch-sync-on-delete", async (t) => {
  const testBed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | hello",
      "user:user | 0755 | target/",
    ],
  });

  const child = testBed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });
  try {
    // Wait for the initial sync to complete
    await child.waitForStderr("source -> target", { timeoutMillis: 5000 });
    await sleep(2000);

    await testBed.deleteFile("source/file.txt");

    await child.waitForStderr("source -> target", { minCount: 2, timeoutMillis: 5000 });

    assertEquals(await testBed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0755 | target/",
    ]);
  } finally {
    child.stop();
  }
});

Deno.test("watch-sync-new-file", async (t) => {
  const testBed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0755 | target/",
    ],
  });

  const child = testBed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });
  try {
    await sleep(1000);
    await testBed.writeTextFile("source/new-file.txt", "new file content");
    await testBed.mkdir("source/subdir");
    await testBed.writeTextFile("source/subdir/new-file-2.txt", "new file content 2");
    await child.waitForStderr("source -> target", { minCount: 1, timeoutMillis: 5000 });

    await sleep(100);

    assertEquals(await testBed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/new-file.txt | new file content",
      "user:user | 0755 | source/subdir/",
      "user:user | 0644 | source/subdir/new-file-2.txt | new file content 2",
      "user:user | 0755 | target/",
      "user:user | 0644 | target/new-file.txt | new file content",
      "user:user | 0755 | target/subdir/",
      "user:user | 0644 | target/subdir/new-file-2.txt | new file content 2",
    ]);
  } finally {
    child.stop();
  }
});

Deno.test("watch-empty-dir", async (t) => {
  const testBed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0755 | source/subdir/",
      "user:user | 0755 | target/",
      "user:user | 0755 | target/subdir/",
    ],
  });

  const child = testBed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });

  try {
    await sleep(1000);
    await testBed.writeTextFile("source/subdir/new-file.txt", "contents");

    await child.waitForStderr("source -> target", { minCount: 1, timeoutMillis: 5000 });
    await sleep(1000)

    assertEquals(await testBed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0755 | source/subdir/",
      "user:user | 0644 | source/subdir/new-file.txt | contents",
      "user:user | 0755 | target/",
      "user:user | 0755 | target/subdir/",
      "user:user | 0644 | target/subdir/new-file.txt | contents",
    ]);
  } finally {
    child.stop();
  }
});

Deno.test("do-not-watch-too-much", async (t) => {
  const testBed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["subdir/subsub/*.txt"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0755 | source/subdir/",
      "user:user | 0755 | source/subdir/subsub/",
      "user:user | 0755 | source/subdir/other-dir/",
      "user:user | 0755 | target/",
      "user:user | 0755 | target/subdir/",
    ],
  });

  const child = testBed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });

  try {
    await sleep(1000);
    await testBed.writeTextFile("source/subdir/other-dir/new-file.txt", "contents");
    await sleep(2000);
    assertEquals(child.stderr.text, deindent`
        Running initial sync!
        Done!
    `);
  } finally {
    child.stop();
  }
});
