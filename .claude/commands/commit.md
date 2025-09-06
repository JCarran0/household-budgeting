---
allowed-tools: Bash(git:*), Bash(npm test:*), Bash(npm run lint:*), Bash(npm run build:*), Read
description: Create atomic, conventional commits with proper validation
---

# Commit Session Changes

I'll create a clean, atomic commit for the changes made in this session, following conventional commit standards.

## Project Standards
@CLAUDE.md

## Commit Process

### Step 1: Review Changes
I'll check what files have been modified and ensure we only commit relevant changes from this session.

### Step 2: Validate Changes
Before committing, I'll:
- ✅ Run relevant tests for modified code
- ✅ Run linting on changed files
- ✅ Ensure the build succeeds (if applicable)
- ✅ Check for any unintended changes from other work

### Step 3: Create Atomic Commit
Following our conventional commit format:
- **feat**: New feature (triggers MINOR version)
- **fix**: Bug fix (triggers PATCH version)  
- **docs**: Documentation only
- **style**: Code style changes
- **refactor**: Code refactoring
- **test**: Test additions/updates
- **chore**: Maintenance tasks
- **perf**: Performance improvements
- **build**: Build system changes
- **ci**: CI/CD changes

Breaking changes: Add `!` after type or `BREAKING CHANGE:` in footer

### Step 4: Commit Message
Based on the actual changes made, I'll craft a commit message that:
- Uses the appropriate type prefix
- Has a clear, concise description
- Includes scope if relevant
- Adds body for context if needed
- References issues if applicable

### Important Considerations
- **Atomic commits**: Each commit should represent one logical change
- **File isolation**: Only commit files modified in this session to avoid conflicts with other concurrent work
- **Test verification**: Ensure changes don't break existing functionality
- **Conventional format**: Maintain consistency for changelog generation

Let me analyze the current changes and create an appropriate commit...