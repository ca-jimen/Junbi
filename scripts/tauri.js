import { execSync } from 'child_process';

const args = process.argv.slice(2).join(' ');
const cmd = process.platform === 'win32'
  ? `tauri ${args}`
  : `PATH="$HOME/.cargo/bin:$PATH" tauri ${args}`;

execSync(cmd, { stdio: 'inherit', shell: true });
