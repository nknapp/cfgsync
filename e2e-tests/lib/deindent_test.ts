import { assertEquals } from "./assert.ts";
import { deindent } from "./deindent.ts";

Deno.test("deindent", () => {
  let result = deindent`
        abc
           cde
              def
        `;
  assertEquals(result.replace(/ /g, "."), "abc\n...cde\n......def\n");
});

Deno.test("ignores empty lines", () => {
  let result = deindent`
        abc
           cde
    
              def
        `;
  assertEquals(result.replace(/ /g, "."), "abc\n...cde\n\n......def\n");
});
