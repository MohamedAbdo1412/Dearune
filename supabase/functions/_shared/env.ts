export function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment secret: ${name}`)
  return value
}

export function envOr(name: string, fallback: string): string {
  return Deno.env.get(name) ?? fallback
}