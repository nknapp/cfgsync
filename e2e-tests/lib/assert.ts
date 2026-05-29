export { assert, assertEquals } from "@std/assert";
import { assertEquals } from "@std/assert";

/**
 * Asserts that the actual output matches the expected output after normalization.
 *
 * The function removes trailing spaces from each line of both the actual and expected
 * strings and then trims the resulting strings before comparing them using assertEquals.
 *
 * @param {string} actual - The actual output string produced by the code under test.
 * @param {string} expected - The expected output string to compare against.
 * @return {void} This function does not return a value. It throws an assertion error
 *                if the normalized strings do not match.
 */
export function assertOutput(actual: string, expected: string) {

  assertEquals(
    actual.replace(/ $/mg, "").trim(),
    expected.replace(/ $/mg, "").trim(),
  );
}


