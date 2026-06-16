import { assertEquals } from "./lib/assert.ts";
import { deindent } from "./lib/deindent.ts";
import { TestBed } from "./lib/TestBed.ts";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.test("hooks-watch-mode", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "echo -n x >> ./target/hook-ran" }
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | original content",
      "user:user | 0755 | target/",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "--watch"] });
  try {
    await child.waitForStderr("source -> target", { timeoutMillis: 5000 });
    await sleep(2000);
    await testbed.writeTextFile("source/file.txt", "modified content");
    await child.waitForStderr("source -> target", { minCount: 2, timeoutMillis: 5000 });
    await sleep(2000);

    // Verify both initial and follow-up syncs (hook ran twice creating the marker)
    assertEquals(await testbed.readTestDir(), [
      "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | modified content",
      "user:user | 0755 | target/",
      "user:user | 0644 | target/file.txt | modified content",
      "user:user | 0644 | target/hook-ran | xx",
    ]);
  } finally {
    child.stop();
  }
});
