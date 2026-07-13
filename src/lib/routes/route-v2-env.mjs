export function envFlag(env = process.env, name, defaultValue = false) {
  const raw = env?.[name];
  if (raw == null || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLocaleLowerCase("en-US"));
}
