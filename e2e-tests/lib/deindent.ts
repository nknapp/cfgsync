export function deindent(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  const lines = String.raw(strings, ...values).split("\n");
  const indents = lines.map((line) => {
    if (line.trim() == "") return Infinity;
    return line.match(/^ */)![0].length;
  });
  const minIndent = Math.min(...indents);
  return lines.map((line) => line.substring(minIndent).trimEnd()).join("\n")
    .trim() + "\n";
}
