#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse conventional commit message
function parseCommit(message) {
  // Check for breaking change
  const isBreaking = message.includes('BREAKING CHANGE') || 
                     message.includes('!:');
  
  // Parse commit type and scope
  const conventionalRegex = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)/;
  const match = message.match(conventionalRegex);
  
  if (!match) {
    return null; // Not a conventional commit
  }
  
  const [, type, scope, breaking, description] = match;
  
  return {
    type,
    scope,
    breaking: isBreaking || !!breaking,
    description: description.trim()
  };
}

// Map commit types to changelog sections
function getSection(type) {
  const sectionMap = {
    'feat': 'Added',
    'fix': 'Fixed',
    'docs': 'Documentation',
    'style': 'Changed',
    'refactor': 'Changed',
    'perf': 'Performance',
    'test': 'Testing',
    'chore': 'Maintenance',
    'build': 'Build',
    'ci': 'CI/CD',
    'revert': 'Reverted'
  };
  
  return sectionMap[type] || null;
}

// Format commit for changelog
function formatCommitLine(commit, scope, description) {
  if (scope) {
    return `- **${scope}**: ${description}`;
  }
  return `- ${description}`;
}

// Read and parse commits
function processCommits(commitsFile) {
  if (!fs.existsSync(commitsFile)) {
    console.log('No commits file provided, checking git log...');
    return [];
  }
  
  const commits = fs.readFileSync(commitsFile, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const [hash, ...messageParts] = line.split(' ');
      return messageParts.join(' ');
    });
  
  const categorized = {
    'Breaking Changes': [],
    'Added': [],
    'Fixed': [],
    'Changed': [],
    'Deprecated': [],
    'Removed': [],
    'Security': [],
    'Performance': [],
    'Documentation': [],
    'Testing': [],
    'Build': [],
    'CI/CD': [],
    'Maintenance': []
  };
  
  commits.forEach(message => {
    const parsed = parseCommit(message);
    if (!parsed) return;
    
    const section = getSection(parsed.type);
    if (!section) return;
    
    const line = formatCommitLine(parsed, parsed.scope, parsed.description);
    
    if (parsed.breaking) {
      categorized['Breaking Changes'].push(line);
    }
    
    if (section === 'Documentation' || section === 'Testing' || 
        section === 'Build' || section === 'CI/CD' || section === 'Maintenance') {
      // These go in their own sections
      categorized[section].push(line);
    } else {
      // Regular sections
      categorized[section].push(line);
    }
  });
  
  return categorized;
}

// Update CHANGELOG.md
function updateChangelog(categorized) {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  let changelog = fs.readFileSync(changelogPath, 'utf-8');
  
  // Find the Unreleased section
  const unreleasedIndex = changelog.indexOf('## [Unreleased]');
  if (unreleasedIndex === -1) {
    console.error('Could not find ## [Unreleased] section in CHANGELOG.md');
    process.exit(1);
  }
  
  // Find the next version section (to know where Unreleased ends)
  const nextSectionRegex = /\n## \[[\d.]+(?:-\w+\.\d+)?\]/;
  const nextSectionMatch = changelog.slice(unreleasedIndex + 15).match(nextSectionRegex);
  const unreleasedEndIndex = nextSectionMatch 
    ? unreleasedIndex + 15 + nextSectionMatch.index
    : changelog.length;
  
  // Extract current unreleased content
  const unreleasedContent = changelog.slice(unreleasedIndex, unreleasedEndIndex);
  
  // Build new unreleased section
  let newUnreleased = '## [Unreleased]\n';
  
  // Add sections with content
  const sectionOrder = [
    'Breaking Changes', 'Added', 'Fixed', 'Changed', 'Deprecated', 
    'Removed', 'Security', 'Performance', 'Documentation', 'Testing',
    'Build', 'CI/CD', 'Maintenance'
  ];
  
  // Parse existing unreleased content to preserve manual edits
  const existingItems = {};
  let currentSection = null;
  unreleasedContent.split('\n').forEach(line => {
    if (line.startsWith('### ')) {
      currentSection = line.replace('### ', '').trim();
      if (!existingItems[currentSection]) {
        existingItems[currentSection] = [];
      }
    } else if (line.startsWith('- ') && currentSection) {
      existingItems[currentSection].push(line);
    }
  });
  
  // Merge new items with existing
  sectionOrder.forEach(section => {
    const existing = existingItems[section] || [];
    const newItems = categorized[section] || [];
    
    // Combine and deduplicate
    const allItems = [...new Set([...existing, ...newItems])];
    
    if (allItems.length > 0) {
      newUnreleased += `\n### ${section}\n`;
      allItems.forEach(item => {
        newUnreleased += `${item}\n`;
      });
    }
  });
  
  // Replace the unreleased section
  const newChangelog = 
    changelog.slice(0, unreleasedIndex) +
    newUnreleased +
    '\n' +
    changelog.slice(unreleasedEndIndex);
  
  fs.writeFileSync(changelogPath, newChangelog);
  console.log('✅ CHANGELOG.md updated successfully');
}

// Main execution
function main() {
  const commitsFile = process.argv[2];
  
  if (!commitsFile && !process.env.CI) {
    console.log('Usage: node update-changelog.js <commits-file>');
    console.log('In CI, commits are read from the file specified');
    process.exit(1);
  }
  
  const categorized = processCommits(commitsFile);
  
  // Check if there are any changes to add
  const hasChanges = Object.values(categorized).some(items => items.length > 0);
  
  if (!hasChanges) {
    console.log('No conventional commits found to add to changelog');
    return;
  }
  
  updateChangelog(categorized);
}

main();