const { execSync } = require('child_process');
const fs = require('fs');

try {
  const stdout = execSync('git status', { encoding: 'utf8' });
  fs.writeFileSync('git_output.txt', 'STDOUT:\n' + stdout);
} catch (error) {
  fs.writeFileSync('git_output.txt', 'ERROR:\n' + error.message + '\nSTDERR:\n' + (error.stderr || '') + '\nSTDOUT:\n' + (error.stdout || ''));
}
