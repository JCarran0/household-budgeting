# Contributing to Household Budgeting App

## Versioning and Release Process

This project uses [Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/) to automate version management and changelog generation.

### Commit Message Format

All commits should follow the conventional commit format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Types
- **feat**: A new feature (triggers MINOR version bump)
- **fix**: A bug fix (triggers PATCH version bump)
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (formatting, etc.)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks, dependency updates, etc.
- **build**: Changes to build system or dependencies
- **ci**: Changes to CI/CD configuration

#### Breaking Changes
To indicate a breaking change (triggers MAJOR version bump):
1. Add `!` after the type: `feat!: remove deprecated API`
2. OR add `BREAKING CHANGE:` in the footer:
```
feat: migrate authentication to JWT

BREAKING CHANGE: API tokens are no longer supported.
Users must use JWT tokens for authentication.
```

### Examples

```bash
# Feature
feat(auth): add two-factor authentication support

# Bug fix
fix(transactions): correct date parsing for recurring transactions

# Breaking change
feat!(api): change response format to JSON-API spec

# With scope and breaking change footer
feat(database): migrate from MongoDB to PostgreSQL

BREAKING CHANGE: Database connection string format has changed.
Update your .env file with PostgreSQL connection details.
```

## Changelog Management

### Automatic Updates
The CHANGELOG.md is automatically updated after each push to main:
1. GitHub Actions workflow analyzes new commits
2. Parses conventional commit messages
3. Updates the `[Unreleased]` section
4. Commits changes back to the repository

### Manual Edits
You can manually edit the `[Unreleased]` section in CHANGELOG.md to:
- Improve descriptions for clarity
- Add additional context
- Group related changes
- Remove irrelevant entries

The automatic updates will preserve your manual edits.

## Release Process

### Creating a Release

1. **Review Unreleased Changes**
   ```bash
   # Check what's pending release
   cat CHANGELOG.md | head -50
   ```

2. **Prepare the Release**
   ```bash
   # Automatic version detection based on changes
   npm run release:prepare
   
   # OR specify version bump type
   npm run release:prepare -- minor
   npm run release:prepare -- major
   npm run release:prepare -- patch
   
   # For alpha/beta releases
   npm run release:prepare -- prerelease
   ```

3. **Review and Commit**
   ```bash
   # Review the changes
   git diff
   
   # Commit the release
   git add -A
   git commit -m "chore: release v1.0.0"
   
   # Push commit and tag
   git push
   git push --tags
   ```

4. **Deploy to Production**
   - Go to GitHub Actions
   - Run "Deploy to Production" workflow
   - The deployment will include the new version

### Version Display

The application version is available at:
- **Health endpoint**: `/health` - includes version in response
- **Version endpoint**: `/version` - shows current version and unreleased changes
- **Frontend footer**: Displays current version (coming soon)

## Development Workflow

### Day-to-Day Development

1. **Work on main branch** (since you're the sole developer)
2. **Use conventional commits** for all changes
3. **Push to GitHub** - changelog updates automatically
4. **Deploy when ready** - no need to release for every deployment

### When to Create a Release

Create a versioned release when:
- Reaching a significant milestone
- Before major changes (create a stable point)
- Monthly/quarterly for regular cadence
- When sharing the app with others

### Version Numbers

- **1.0.0-alpha.X**: Early development, not feature-complete
- **1.0.0-beta.X**: Feature-complete but still testing
- **1.0.0**: First stable release
- **1.X.0**: New features added
- **1.0.X**: Bug fixes only
- **2.0.0**: Breaking changes

## Tips

1. **Don't worry about perfect commits** - the changelog can be edited
2. **Group related commits** - use the same scope for related changes
3. **Be descriptive** - "fix: resolve login issue" is better than "fix: bug"
4. **Test locally first** - ensure builds pass before committing
5. **Review changelogs** - before releasing, ensure changelog makes sense

## Questions?

Check the documentation in `/docs` or create an issue on GitHub.