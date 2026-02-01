import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const newVersion = process.argv[2];

const rootDir = process.cwd();

// Files to update manually
const manualFiles = [
  {
    path: path.join(rootDir, 'src-tauri/tauri.conf.json'),
    type: 'json',
    key: 'version'
  },
  {
    path: path.join(rootDir, 'src-tauri/Cargo.toml'),
    type: 'toml',
    regex: /^version\s*=\s*"(.*)"/m,
    replace: `version = "${newVersion}"`
  }
];

try {
  // 1. Create release branch
  console.log(`Creating release branch: release/v${newVersion}...`);
  execSync(`git checkout -b release/v${newVersion}`);

  // 2. Update package.json using npm version
  console.log('Updating package.json and package-lock.json via npm version...');
  execSync(`npm version ${newVersion} --no-git-tag-version`);

  // 3. Update other files manually
  for (const file of manualFiles) {
    console.log(`Updating ${path.basename(file.path)}...`);
    let content = fs.readFileSync(file.path, 'utf8');
    
    if (file.type === 'json') {
      const json = JSON.parse(content);
      json[file.key] = newVersion;
      content = JSON.stringify(json, null, 2) + '\n';
    } else if (file.type === 'toml') {
      content = content.replace(file.regex, file.replace);
    }
    
    fs.writeFileSync(file.path, content);
  }

  // 4. Commit changes
  console.log('Committing changes...');
  execSync('git add .');
  execSync(`git commit -m "chore: bump version to ${newVersion}"`);

  // 5. Create tag
  console.log(`Creating tag v${newVersion}...`);
  execSync(`git tag v${newVersion}`);

  // 6. Push
  console.log('Pushing changes to origin...');
  execSync(`git push origin release/v${newVersion}`);
  execSync(`git push origin v${newVersion}`);

  console.log(`\nSuccessfully managed release v${newVersion}!`);
  console.log(`Current branch: release/v${newVersion}`);
  console.log(`Created tag: v${newVersion}`);
} catch (error) {
  console.error('\nError managing release:', error.message);
  process.exit(1);
}
