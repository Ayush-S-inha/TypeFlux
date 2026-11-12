import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceDir = fileURLToPath(new URL('../src/', import.meta.url));
const projectDir = fileURLToPath(new URL('../', import.meta.url));

function collectImportStatements(moduleSource) {
  const statements = [];
  const lines = moduleSource.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trimStart().startsWith('import ')) continue;
    let statement = lines[index];
    while (!statement.includes(';') && index + 1 < lines.length) {
      index += 1;
      statement += ` ${lines[index].trim()}`;
    }
    statements.push(statement);
  }
  return statements;
}

test('every local import in src resolves to a project file', async () => {
  const moduleNames = (await readdir(sourceDir)).filter((name) => name.endsWith('.js'));
  for (const moduleName of moduleNames) {
    const moduleSource = await readFile(path.join(sourceDir, moduleName), 'utf8');
    for (const statement of collectImportStatements(moduleSource)) {
      const specifier = statement.match(/(?:from\s+)?['"](\.[^'"]+)['"]/)?.[1];
      if (!specifier) continue;
      await access(path.resolve(sourceDir, specifier));
    }
  }
});

test('every named local import matches an exported symbol', async () => {
  const moduleNames = (await readdir(sourceDir)).filter((name) => name.endsWith('.js'));
  const modules = new Map();
  for (const moduleName of moduleNames) {
    modules.set(moduleName, await readFile(path.join(sourceDir, moduleName), 'utf8'));
  }

  for (const [moduleName, moduleSource] of modules) {
    for (const statement of collectImportStatements(moduleSource)) {
      const namedImport = statement.match(/import\s+\{([\s\S]*?)\}\s+from\s+['"](\.[^'"]+)['"]/);
      if (!namedImport) continue;
      const targetName = path.basename(namedImport[2]);
      const targetSource = modules.get(targetName);
      assert.ok(targetSource, `${moduleName} imports missing module ${targetName}`);
      const exportedNames = new Set(
        [...targetSource.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([\w$]+)/g)]
          .map((match) => match[1]),
      );
      for (const importedName of namedImport[1].split(',').map((name) => name.trim()).filter(Boolean)) {
        const symbol = importedName.split(/\s+as\s+/)[0].trim();
        assert.ok(exportedNames.has(symbol), `${moduleName} imports missing export ${symbol} from ${targetName}`);
      }
    }
  }
});

test('Vite entry point and stylesheet remain connected to the application', async () => {
  const html = await readFile(path.join(projectDir, 'index.html'), 'utf8');
  const mainSource = await readFile(path.join(sourceDir, 'main.js'), 'utf8');
  assert.match(html, /<script\s+type="module"\s+src="\/src\/main\.js"><\/script>/);
  assert.match(mainSource, /^import '\.\/style\.css';/);
});

test('package metadata matches the lockfile and exposes test and build commands', async () => {
  const pkg = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(projectDir, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.name, lock.name);
  assert.equal(pkg.version, lock.version);
  assert.deepEqual(pkg.dependencies || {}, {});
  assert.deepEqual(pkg.devDependencies, { vite: '^7.3.8' });
  assert.equal(lock.packages[''].name, pkg.name);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
  assert.equal(lock.packages['node_modules/vite'].version, '7.3.8');
  assert.equal(pkg.scripts.test, 'node --test');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.engines.node, '^20.19.0 || >=22.12.0');
});
