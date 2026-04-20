function parseVersion(version, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid ${label}: ${version}`);
  }

  return match.slice(1).map((part) => Number(part));
}

function compareVersionTuple(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    return left[index] > right[index] ? 1 : -1;
  }

  return 0;
}

export function resolveNextVersion(currentVersion, latestTag) {
  const currentTuple = parseVersion(currentVersion, "currentVersion");
  if (!latestTag) return currentVersion;

  const tagVersion = latestTag.replace(/^v/, "");
  const tagTuple = parseVersion(tagVersion, "latestTag");

  if (compareVersionTuple(currentTuple, tagTuple) > 0) {
    return currentVersion;
  }

  return [tagTuple[0], tagTuple[1], tagTuple[2] + 1].join(".");
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
