import fs from "node:fs";
import path from "node:path";

const ALLOWED_EXTENSIONS = new Set([".AppImage", ".dmg", ".exe", ".zip"]);

function walkFiles(rootDirectory) {
  const files = [];
  const queue = [rootDirectory];

  while (queue.length > 0) {
    const currentDirectory = queue.pop();
    for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

export function collectReleaseAssets(inputDirectory, outputDirectory) {
  const sourceDirectory = path.resolve(inputDirectory);
  const targetDirectory = path.resolve(outputDirectory);

  if (!fs.existsSync(sourceDirectory)) {
    throw new Error(`Release output directory does not exist: ${sourceDirectory}`);
  }

  fs.rmSync(targetDirectory, { force: true, recursive: true });
  fs.mkdirSync(targetDirectory, { recursive: true });

  const collectedFiles = walkFiles(sourceDirectory)
    .filter((filePath) => ALLOWED_EXTENSIONS.has(path.extname(filePath)))
    .sort((left, right) => left.localeCompare(right));

  for (const filePath of collectedFiles) {
    const destinationPath = path.join(targetDirectory, path.basename(filePath));
    fs.copyFileSync(filePath, destinationPath);
  }

  return collectedFiles.map((filePath) => path.basename(filePath));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputDirectory = process.argv[2];
  const outputDirectory = process.argv[3];

  if (!inputDirectory || !outputDirectory) {
    console.error("Usage: node scripts/ci/collect-release-assets.mjs <input-dir> <output-dir>");
    process.exit(1);
  }

  const collectedFiles = collectReleaseAssets(inputDirectory, outputDirectory);
  if (collectedFiles.length === 0) {
    console.error(`No installer assets found in ${path.resolve(inputDirectory)}`);
    process.exit(1);
  }

  process.stdout.write(`${collectedFiles.join("\n")}\n`);
}
