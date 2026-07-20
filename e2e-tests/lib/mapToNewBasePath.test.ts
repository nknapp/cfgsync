import { assertEquals } from "./assert.ts";
import { mapToNewBasePath } from "./mapToNewBasePath.ts";

Deno.test("map to new base path", () => {
  assertEquals(
    mapToNewBasePath(
      new URL("file:///tmp/from/subdir/text.txt"),
      new URL("file:///tmp/from/"),
      new URL("file:///tmp/to/"),
    ),
    new URL("file:///tmp/to/subdir/text.txt"),
  );
});

Deno.test("map director to new base path", () => {
  assertEquals(
    mapToNewBasePath(
      new URL("file:///tmp/from/subdir/test/"),
      new URL("file:///tmp/from/"),
      new URL("file:///tmp/to/"),
    ),
    new URL("file:///tmp/to/subdir/test/"),
  );
});
