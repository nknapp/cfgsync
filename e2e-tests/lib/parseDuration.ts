export function parseDuration(duration: string): number {
  if (!duration || duration === "0") return 0;
  const msMatch = duration.match(/^(-?\d+)\s*ms$/);
  if (msMatch) return parseInt(msMatch[1]);
  const secMatch = duration.match(/^(-?\d+)\s*sec$/);
  if (secMatch) return parseInt(secMatch[1]) * 1000;
  throw new Error(`Invalid duration format: "${duration}". Use "X ms" or "Y sec"`);
}
