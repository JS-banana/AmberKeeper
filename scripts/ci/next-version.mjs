export function resolveNextVersion(currentVersion, latestTag) {
  if (!latestTag) return currentVersion;

  const tagVersion = latestTag.replace(/^v/, "");
  if (tagVersion !== currentVersion) return currentVersion;

  const [major, minor, patch] = tagVersion.split(".").map(Number);
  return [major, minor, patch + 1].join(".");
}

function readInputValue(argIndex, envKey) {
  const value = process.argv[argIndex];
  if (value) return value;
  const envValue = process.env[envKey];
  return envValue || "";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const currentVersion = readInputValue(2, "CURRENT_VERSION");
  const latestTag = readInputValue(3, "LATEST_TAG") || null;

  if (!currentVersion) {
    console.error("CURRENT_VERSION is required");
    process.exit(1);
  }

  const nextVersion = resolveNextVersion(currentVersion, latestTag);
  process.stdout.write(nextVersion);
}
