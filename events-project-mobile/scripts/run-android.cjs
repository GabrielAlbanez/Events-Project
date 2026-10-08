const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const env = { ...process.env };
if (process.platform === 'win32') {
  const candidates = env.EVENTMAP_JAVA_HOME ? [env.EVENTMAP_JAVA_HOME] : [
    env.ANDROID_STUDIO_HOME && path.join(env.ANDROID_STUDIO_HOME, 'jbr'),
    path.join(env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
    env.JAVA_HOME,
  ];
  const home = candidates.filter(Boolean).find(candidate => {
    const java = path.join(candidate, 'bin', 'java.exe');
    if (!fs.existsSync(java)) return false;
    const result = spawnSync(java, ['-version'], { encoding: 'utf8', windowsHide: true });
    return result.status === 0 && /version "(?:17|21)\./.test(result.stderr + result.stdout);
  });
  if (!home) {
    console.error('Android requires a JDK 17 or 21 for this project. Set EVENTMAP_JAVA_HOME to its installation directory.');
    process.exit(1);
  }
  env.JAVA_HOME = home;
  // Windows environment names are case-insensitive, but JavaScript object keys are not.
  // npm/cmd may supply Path instead of PATH; keeping both can hide Node from Gradle.
  const pathKeys = Object.keys(env).filter(key => key.toLowerCase() === 'path');
  const inheritedPath = pathKeys.map(key => env[key]).filter(Boolean).join(path.delimiter);
  for (const key of pathKeys) delete env[key];
  env.PATH = [path.dirname(process.execPath), path.join(home, 'bin'), inheritedPath].filter(Boolean).join(path.delimiter);
  console.log('Android build: using JDK at ' + home);
  if (!env.EVENTMAP_NATIVE_CXX_DIR && !process.argv.includes('--help') && !process.argv.includes('-h')) {
    const subst = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'subst.exe');
    const listing = spawnSync(subst, [], { encoding: 'utf8', windowsHide: true });
    if (listing.status !== 0) throw new Error('Unable to inspect Windows drive aliases.');
    const mappings = new Map();
    for (const line of listing.stdout.split(/\r?\n/)) {
      const match = /^([A-Z]):\\: => (.+)$/i.exec(line.trim());
      if (match) mappings.set(match[1].toUpperCase(), path.resolve(match[2]).toLowerCase());
    }
    let drive = [...mappings].find(([, directory]) => directory === project.toLowerCase())?.[0];
    if (!drive) {
      drive = ['X', 'Y', 'Z', 'W', 'V'].find(letter => !mappings.has(letter) && !fs.existsSync(letter + ':\\'));
      if (!drive) throw new Error('No drive alias available for the C++ cache. Set EVENTMAP_NATIVE_CXX_DIR to a short path.');
      const mapped = spawnSync(subst, [drive + ':', project], { encoding: 'utf8', windowsHide: true });
      if (mapped.status !== 0) throw new Error('Unable to create short C++ cache drive alias.');
    }
    env.EVENTMAP_NATIVE_CXX_DIR = drive + ':\\.cxx';
    console.log('Android build: C++ cache at ' + env.EVENTMAP_NATIVE_CXX_DIR);
  }
}
// Resolve the installed CLI directly; no global Expo or shell script is required.
const cli = require.resolve('expo/bin/cli');
const child = spawn(process.execPath, [cli, 'run:android', ...process.argv.slice(2)], { cwd: project, env, stdio: 'inherit' });
child.on('error', error => { console.error('Unable to start Expo: ' + error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });