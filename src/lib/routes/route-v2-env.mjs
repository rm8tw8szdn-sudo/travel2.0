export function envFlag(env = process.env, name, defaultValue = false) {
  const master = env?.ROUTE_V2_RUNTIME_ENABLED;
  if (
    name !== "ROUTE_V2_RUNTIME_ENABLED"
    && String(name || "").startsWith("ROUTE_V2_")
    && !["1", "true", "yes", "on"].includes(String(master).trim().toLocaleLowerCase("en-US"))
  ) {
    return false;
  }
  const raw = env?.[name];
  if (raw == null || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLocaleLowerCase("en-US"));
}
