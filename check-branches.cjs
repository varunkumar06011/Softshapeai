const { execSync } = require('child_process');

const branches = execSync('git branch -r --format=%(refname:short)', { encoding: 'utf8' })
  .trim().split('\n').filter(b => b !== 'origin/HEAD' && b !== 'origin/main');

for (const branch of branches) {
  try {
    const pkg = execSync(`git show ${branch}:package.json`, { encoding: 'utf8' });
    const lock = execSync(`git show ${branch}:package-lock.json`, { encoding: 'utf8' });
    const pj = JSON.parse(pkg);
    const lk = JSON.parse(lock);
    
    const pkgReact = pj.dependencies?.react || '';
    const lockReact = lk.packages?.['node_modules/react']?.version || '';
    const pkgTs = pj.dependencies?.typescript || '';
    const lockTs = lk.packages?.['node_modules/typescript']?.version || '';
    
    const mismatch = (pkgReact.includes('18') && lockReact.startsWith('19')) || 
                     (pkgTs.includes('5') && lockTs.startsWith('6'));
    
    if (mismatch) {
      console.log(`MISMATCH: ${branch}`);
      console.log(`  package.json: react=${pkgReact}, typescript=${pkgTs}`);
      console.log(`  lock file:    react=${lockReact}, typescript=${lockTs}`);
    }
  } catch (e) {
    // skip branches without package.json or package-lock.json
  }
}
