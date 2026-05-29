export function requireEnv(envVarName: string) {
  const value = Deno.env.get(envVarName);
  if (value != null) return value;
  throw new Error(`Required environment variable not set: ${envVarName}`);
}
