const fs = require('fs');
const path = require('path');

console.log('📦 Préparation du build Electron...');

const standalonePath = path.join(__dirname, '..', '.next', 'standalone');
const nextRootPath = path.join(__dirname, '..', '.next');
const nextServerSrc = path.join(nextRootPath, 'server');
const staticSrc = path.join(__dirname, '..', '.next', 'static');
const staticDest = path.join(standalonePath, '.next', 'static');
const publicSrc = path.join(__dirname, '..', 'public');
const publicDest = path.join(standalonePath, 'public');
const buildStandalonePath = path.join(__dirname, '..', 'build', 'standalone');
const rootNodeModulesPath = path.join(__dirname, '..', 'node_modules');
const standaloneNodeModulesPath = path.join(standalonePath, 'node_modules');

// Check if standalone build exists
if (!fs.existsSync(standalonePath)) {
  console.log('⚠️ Le dossier .next/standalone n\'existe pas. Utilisation de .next directement...');
}

// Copy helper
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️ Source n'existe pas: ${src}`);
    return;
  }
  if (typeof fs.cpSync === 'function') {
    fs.cpSync(src, dest, { recursive: true, force: true, dereference: true });
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const realPath = fs.realpathSync(srcPath);
      copyDirSync(realPath, destPath);
      continue;
    }
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
      continue;
    }
    fs.copyFileSync(srcPath, destPath);
  }
}

function removeDirSync(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  if (fs.existsSync(targetPath)) {
    throw new Error(`Suppression impossible: ${targetPath}`);
  }
}

function replaceModuleSync(rootModulesPath, targetModulesPath, mod) {
  const src = path.join(rootModulesPath, mod);
  const dest = path.join(targetModulesPath, mod);

  if (!fs.existsSync(src)) {
    console.warn(`   ⚠️ Module introuvable: ${mod}`);
    return;
  }

  if (fs.existsSync(dest)) {
    removeDirSync(dest);
  }

  console.log(`   - ${mod}`);
  copyDirSync(src, dest);
}

console.log('📁 Copie des fichiers statiques...');
copyDirSync(staticSrc, staticDest);

console.log('📁 Copie des fichiers publics...');
copyDirSync(publicSrc, publicDest);

// Ensure standalone node_modules exists
if (!fs.existsSync(standaloneNodeModulesPath)) {
  fs.mkdirSync(standaloneNodeModulesPath, { recursive: true });
}

const dependenciesToCopy = [
  'next'
];

console.log('📁 Copie des dépendances critiques vers node_modules...');
for (const mod of dependenciesToCopy) {
  replaceModuleSync(rootNodeModulesPath, standaloneNodeModulesPath, mod);
}

if (fs.existsSync(buildStandalonePath)) {
  removeDirSync(buildStandalonePath);
}
fs.mkdirSync(buildStandalonePath, { recursive: true });

console.log('📁 Préparation du dossier standalone pour Electron...');
if (fs.existsSync(standalonePath)) {
  copyDirSync(standalonePath, buildStandalonePath);
} else {
  // Manual standalone creation
  const buildNextPath = path.join(buildStandalonePath, 'next_build');
  fs.mkdirSync(buildNextPath, { recursive: true });
  copyDirSync(nextRootPath, buildNextPath);
}

const buildNextPath = path.join(buildStandalonePath, 'next_build');
const buildNextServerPath = path.join(buildNextPath, 'server');
if (!fs.existsSync(buildNextServerPath)) {
  copyDirSync(nextServerSrc, buildNextServerPath);
}

const buildStandaloneNodeModulesPath = path.join(buildStandalonePath, 'node_modules');
if (!fs.existsSync(buildStandaloneNodeModulesPath)) {
  fs.mkdirSync(buildStandaloneNodeModulesPath, { recursive: true });
}

console.log('📁 Synchronisation finale des dépendances critiques dans build/standalone...');
for (const mod of dependenciesToCopy) {
  replaceModuleSync(rootNodeModulesPath, buildStandaloneNodeModulesPath, mod);
}

const nextManifestFiles = [
  'BUILD_ID',
  'app-build-manifest.json',
  'app-path-routes-manifest.json',
  'build-manifest.json',
  'prerender-manifest.json',
  'react-loadable-manifest.json',
  'required-server-files.json',
  'routes-manifest.json'
];
for (const manifestFile of nextManifestFiles) {
  const srcManifest = path.join(nextRootPath, manifestFile);
  const destManifest = path.join(buildNextPath, manifestFile);
  if (fs.existsSync(srcManifest)) {
    fs.copyFileSync(srcManifest, destManifest);
  }
}

// Ensure entrypoint exists for Electron runtime.
// Some Next.js builds may not generate .next/standalone/server.js.
const standaloneServerPath = path.join(buildStandalonePath, 'server.js');
if (!fs.existsSync(standaloneServerPath)) {
  console.log('🛠️ Génération d\'un server.js fallback...');
  const fallbackServerContent = `const http = require('http');
const next = require('next');

const port = parseInt(process.env.PORT || '3010', 10);
const hostname = process.env.HOSTNAME || '127.0.0.1';
const app = next({ dev: false, dir: __dirname, hostname, port, conf: { distDir: 'next_build' } });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http.createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
    console.log(\`> Ready on http://\${hostname}:\${port}\`);
  });
}).catch((err) => {
  console.error('Failed to start Next.js fallback server:', err);
  process.exit(1);
});
`;
  fs.writeFileSync(standaloneServerPath, fallbackServerContent, 'utf8');
}

// No need to patch server.js for runtime_modules if we use standard node_modules
// But we verify if we need to set NODE_PATH
// The standard resolution should find modules in ./node_modules relative to server.js

console.log('✅ Préparation terminée avec succès!');
