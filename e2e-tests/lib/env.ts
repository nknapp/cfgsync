import NotFound = Deno.errors.NotFound;

const possibleCfgsyncExecutables = [
  "target/x86_64-unknown-linux-musl/release/cfgsync",
  "target/debug/cfgsync",
  "target/release/cfgsync",
] as const;

const projectDir = new URL("../..", import.meta.url);

export const testBaseDir = new URL(
  getFromEnvOrDefault("E2E_TEST_DIR", () => "e2e-tests/_tmp/"),
  projectDir,
);

export const cfgSync = getFromEnvOrDefault(
  "CFGSYNC",
  () => getFirstExistingFile(possibleCfgsyncExecutables),
);

const cfgsyncSource = Deno.env.has("CFGSYNC") ? "$CFGSYNC" : "auto-discovered";
console.error(`[cfgsync e2e] binary: ${cfgSync}  (source: ${cfgsyncSource})`);

function getFromEnvOrDefault(envVar: string, defaultFn: () => string): string {
  const value = Deno.env.get(envVar);
  if (value != null && value !== "") return value;
  return defaultFn();
}

function getFirstExistingFile(
  possibleFiles: Readonly<string[]>,
): string {
  const absolutePaths = possibleFiles.map((path) => new URL(path, projectDir).pathname);
  const firstExisting = absolutePaths.find(isFile);
  if (firstExisting == null) {
    throw new NotFound(`None of ${absolutePaths} exists and is a file.`);
  }
  return firstExisting;
}

function isFile(path: string): boolean {
  try {
    const fileInfo = Deno.statSync(path);
    return fileInfo.isFile;
  } catch (error) {
    if (error instanceof NotFound) return false;
    throw error;
  }
}
