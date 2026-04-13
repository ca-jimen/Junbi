import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';

const args = process.argv.slice(2).join(' ');

// Build the environment for the child process.
// On macOS/Linux, cargo's bin directory is not always on PATH when Node is
// launched from a GUI context (e.g. VS Code, Finder), so we prepend it
// explicitly using Node's own homedir() rather than relying on shell variable
// expansion ($HOME / $PATH), which can silently fail or produce double-colons
// when the shell started by execSync doesn't inherit the interactive profile.
const env = { ...process.env };

if (process.platform === 'win32') {
  // On Windows the project may live in an OneDrive-synced folder.
  // Windows Application Control blocks execution of compiled build scripts
  // in cloud-synced paths, so redirect cargo's output to a local directory.
  env.CARGO_TARGET_DIR = env.CARGO_TARGET_DIR ?? 'C:/cargo-target/junbi';
} else {
  // On macOS/Linux, cargo's bin directory is not always on PATH when Node is
  // launched from a GUI context (e.g. VS Code, Finder), so prepend it.
  const cargoBin = join(homedir(), '.cargo', 'bin');

  // Sanitize PATH: remove Windows-style segments that may have leaked in from a
  // cross-platform environment (e.g. pulling changes committed on Windows).
  // Windows paths like "C:\foo" contain a bare colon, so splitting on ':' yields
  // two fragments: "C" (single-letter drive) and "\foo" (backslash fragment).
  // We drop both kinds, plus any segment that still contains a backslash.
  const rawPath = env.PATH ?? '';
  const cleanSegments = rawPath
    .split(':')
    .filter((seg) => seg && seg.length > 1 && !seg.startsWith('\\') && !seg.includes('\\'));

  // Post-sanitization guard: no valid POSIX segment should contain ':' or '\'.
  for (const seg of cleanSegments) {
    if (seg.includes(':') || seg.includes('\\')) {
      throw new Error(`Invalid PATH segment after sanitization: "${seg}"`);
    }
  }

  env.PATH = [cargoBin, ...cleanSegments].join(':');
}

execSync(`tauri ${args}`, { stdio: 'inherit', shell: true, env });
