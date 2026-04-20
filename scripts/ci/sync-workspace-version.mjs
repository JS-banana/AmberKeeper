import fs from "node:fs";
import path from "node:path";

const DEFAULT_PACKAGE_PATHS = ["package.json", "apps/desktop/package.json"];

function assertVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }
}

export function syncWorkspaceVersion(version, packagePaths = DEFAULT_PACKAGE_PATHS) {
  assertVersion(version);

  const updatedFiles = [];
  for (const packagePath of packagePaths) {
    const resolvedPath = path.resolve(packagePath);
    const packageJson = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));

    if (packageJson.version === version) {
      continue;
    }

    packageJson.version = version;
    fs.writeFileSync(resolvedPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    updatedFiles.push(packagePath);
  }

  return updatedFiles;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2];
  const packagePaths = process.argv.slice(3);

  if (!version) {
    console.error("Usage: node scripts/ci/sync-workspace-version.mjs <version> [package.json ...]");
    process.exit(1);
  }

  const updatedFiles = syncWorkspaceVersion(version, packagePaths.length > 0 ? packagePaths : DEFAULT_PACKAGE_PATHS);
  process.stdout.write(`${updatedFiles.join("\n")}\n`);
}
