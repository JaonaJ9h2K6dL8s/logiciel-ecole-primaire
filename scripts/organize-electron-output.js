const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'dist-electron-v25');
const releaseDir = path.join(outputDir, 'release');
const installerDir = path.join(releaseDir, 'installateur');
const portableDir = path.join(releaseDir, 'portable');
const debugDir = path.join(releaseDir, 'debug');

if (!fs.existsSync(outputDir)) {
  process.exit(0);
}

for (const dir of [releaseDir, installerDir, portableDir, debugDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const entries = fs.readdirSync(outputDir, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isFile()) {
    continue;
  }

  const sourcePath = path.join(outputDir, entry.name);
  const lowerName = entry.name.toLowerCase();
  let targetDir = null;

  if (lowerName.includes('setup') && lowerName.endsWith('.exe')) {
    targetDir = installerDir;
  } else if (lowerName.includes('setup') && lowerName.endsWith('.blockmap')) {
    targetDir = installerDir;
  } else if (!lowerName.includes('setup') && lowerName.endsWith('.exe')) {
    targetDir = portableDir;
  } else if (lowerName === 'builder-debug.yml' || lowerName === 'builder-effective-config.yaml') {
    targetDir = debugDir;
  }

  if (!targetDir) {
    continue;
  }

  const targetPath = path.join(targetDir, entry.name);
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { force: true });
  }
  fs.renameSync(sourcePath, targetPath);
}

const dirsToDelete = [
  'win-unpacked',
  'win-arm64-unpacked',
  'win-ia32-unpacked',
  'win32-unpacked',
];

for (const dirName of dirsToDelete) {
  const fullPath = path.join(outputDir, dirName);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}
