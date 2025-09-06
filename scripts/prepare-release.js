#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Determine version bump type from unreleased changes
function determineVersionBump(unreleasedContent) {
  // Check for breaking changes
  if (unreleasedContent.includes('### Breaking Changes')) {
    return 'major';
  }
  
  // Check for new features
  if (unreleasedContent.includes('### Added')) {
    return 'minor';
  }
  
  // Default to patch for fixes, changes, etc.
  return 'patch';
}

// Bump version number
function bumpVersion(currentVersion, bumpType) {
  const versionParts = currentVersion.replace(/^v/, '').split(/[-+]/)[0].split('.');
  const [major, minor, patch] = versionParts.map(Number);
  const prerelease = currentVersion.includes('-') ? currentVersion.split('-')[1] : null;
  
  let newVersion;
  
  switch (bumpType) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
    case 'prerelease':
      if (prerelease) {
        // Increment prerelease version
        const prereleaseMatch = prerelease.match(/^(\w+)\.(\d+)/);
        if (prereleaseMatch) {
          const [, label, num] = prereleaseMatch;
          newVersion = `${major}.${minor}.${patch}-${label}.${parseInt(num) + 1}`;
        } else {
          newVersion = `${major}.${minor}.${patch}-${prerelease}.1`;
        }
      } else {
        // First prerelease
        newVersion = `${major}.${minor}.${patch}-alpha.1`;
      }
      break;
    case 'release':
      // Remove prerelease tag
      newVersion = `${major}.${minor}.${patch}`;
      break;
    default:
      throw new Error(`Unknown bump type: ${bumpType}`);
  }
  
  return newVersion;
}

// Update package.json files
function updatePackageVersions(newVersion) {
  const files = [
    'package.json',
    'backend/package.json',
    'frontend/package.json'
  ];
  
  files.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      pkg.version = newVersion;
      fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`✅ Updated ${file} to version ${newVersion}`);
    }
  });
}

// Move unreleased to versioned section
function updateChangelogForRelease(newVersion) {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  let changelog = fs.readFileSync(changelogPath, 'utf-8');
  
  // Find the Unreleased section
  const unreleasedIndex = changelog.indexOf('## [Unreleased]');
  if (unreleasedIndex === -1) {
    console.error('Could not find ## [Unreleased] section in CHANGELOG.md');
    process.exit(1);
  }
  
  // Find the next version section
  const nextSectionRegex = /\n## \[[\d.]+(?:-\w+\.\d+)?\]/;
  const nextSectionMatch = changelog.slice(unreleasedIndex + 15).match(nextSectionRegex);
  const unreleasedEndIndex = nextSectionMatch 
    ? unreleasedIndex + 15 + nextSectionMatch.index
    : changelog.length;
  
  // Extract unreleased content
  const unreleasedContent = changelog.slice(unreleasedIndex + 15, unreleasedEndIndex).trim();
  
  // Check if unreleased has content
  if (!unreleasedContent || unreleasedContent.length < 10) {
    console.log('⚠️  No changes in Unreleased section to release');
    return false;
  }
  
  // Format date
  const date = new Date().toISOString().split('T')[0];
  
  // Create new version section
  const versionSection = `## [${newVersion}] - ${date}\n\n${unreleasedContent}`;
  
  // Update changelog
  const newChangelog = 
    changelog.slice(0, unreleasedIndex) +
    '## [Unreleased]\n\n' +
    versionSection +
    '\n\n' +
    changelog.slice(unreleasedEndIndex);
  
  // Update comparison links at the bottom
  const compareSection = newChangelog.match(/\[Unreleased\]: https:\/\/github\.com\/.+\/compare\/.+\.\.\.HEAD/);
  if (compareSection) {
    const repoMatch = compareSection[0].match(/github\.com\/([^\/]+\/[^\/]+)/);
    if (repoMatch) {
      const repo = repoMatch[1];
      const newCompareLinks = 
        `[Unreleased]: https://github.com/${repo}/compare/v${newVersion}...HEAD\n` +
        `[${newVersion}]: https://github.com/${repo}/compare/v${changelog.match(/\[(\d+\.\d+\.\d+(?:-\w+\.\d+)?)\]/)[1]}...v${newVersion}`;
      
      // Replace the old unreleased link
      const updatedChangelog = newChangelog.replace(
        /\[Unreleased\]: https:\/\/github\.com\/.+\/compare\/.+\.\.\.HEAD/,
        newCompareLinks
      );
      
      fs.writeFileSync(changelogPath, updatedChangelog);
    } else {
      fs.writeFileSync(changelogPath, newChangelog);
    }
  } else {
    fs.writeFileSync(changelogPath, newChangelog);
  }
  
  console.log(`✅ CHANGELOG.md updated for version ${newVersion}`);
  return true;
}

// Create git tag
function createGitTag(version, message) {
  try {
    execSync(`git tag -a v${version} -m "${message}"`, { stdio: 'pipe' });
    console.log(`✅ Created git tag v${version}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to create git tag: ${error.message}`);
    return false;
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const bumpType = args[0] || 'auto';
  const skipTag = args.includes('--no-tag');
  const dryRun = args.includes('--dry-run');
  
  // Read current version
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  const currentVersion = pkg.version;
  console.log(`Current version: ${currentVersion}`);
  
  // Determine version bump
  let finalBumpType = bumpType;
  if (bumpType === 'auto') {
    const changelog = fs.readFileSync('CHANGELOG.md', 'utf-8');
    const unreleasedMatch = changelog.match(/## \[Unreleased\]([\s\S]*?)## \[[\d.]+/);
    if (unreleasedMatch) {
      finalBumpType = determineVersionBump(unreleasedMatch[1]);
      console.log(`Auto-detected version bump: ${finalBumpType}`);
    } else {
      console.log('Could not determine version bump automatically, defaulting to patch');
      finalBumpType = 'patch';
    }
  }
  
  // Calculate new version
  const newVersion = bumpVersion(currentVersion, finalBumpType);
  console.log(`New version will be: ${newVersion}`);
  
  if (dryRun) {
    console.log('🔍 Dry run mode - no changes will be made');
    return;
  }
  
  // Update package.json files
  updatePackageVersions(newVersion);
  
  // Update CHANGELOG.md
  const changelogUpdated = updateChangelogForRelease(newVersion);
  
  if (!changelogUpdated) {
    console.log('⚠️  No changelog updates, skipping tag creation');
    return;
  }
  
  // Create git tag if not skipped
  if (!skipTag) {
    const tagMessage = `Release v${newVersion}`;
    createGitTag(newVersion, tagMessage);
  }
  
  console.log(`\n🎉 Release v${newVersion} prepared successfully!`);
  console.log('\nNext steps:');
  console.log('1. Review the changes');
  console.log('2. Commit the version updates: git add -A && git commit -m "chore: release v' + newVersion + '"');
  console.log('3. Push the commit and tag: git push && git push --tags');
  console.log('4. Deploy to production via GitHub Actions');
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

main();