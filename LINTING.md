# Linting and Code Quality

This project enforces code quality standards through ESLint, TypeScript strict mode, and automated pre-commit hooks.

## Overview

- **Backend**: TypeScript strict mode checking via `tsc --noEmit`
- **Frontend**: ESLint with TypeScript plugin and React hooks rules
- **Pre-commit Hook**: Automatically checks linting before allowing commits

## Running Linting Manually

### Backend
```bash
cd backend
npm run lint
```

### Frontend
```bash
cd frontend
npm run lint
```

To auto-fix fixable issues:
```bash
npm run lint -- --fix
```

## Pre-Commit Hook

The project uses Husky to run linting checks automatically before each commit. The hook:

- ✅ Only checks files that are being committed
- ✅ Runs appropriate linter based on file type
- ✅ Provides clear feedback on errors
- ✅ Prevents commits with linting errors
- ✅ Suggests fixes when available

### How It Works

1. When you run `git commit`, the pre-commit hook activates
2. It checks which files are staged for commit
3. If backend TypeScript files are changed, it runs backend linting
4. If frontend TypeScript/JavaScript files are changed, it runs frontend linting
5. If any errors are found, the commit is blocked
6. You must fix the errors and try committing again

### Bypassing the Hook (Emergency Only)

If you absolutely need to commit despite linting errors (not recommended):
```bash
git commit --no-verify -m "your message"
```

**⚠️ Warning**: Only bypass the hook in emergencies. Fix linting errors as soon as possible.

## Code Quality Standards

### TypeScript
- **Zero `any` types**: All types must be properly defined
- **Strict mode enabled**: Full TypeScript strict checking
- **Unused variables**: Not allowed
- **Unused imports**: Not allowed

### React
- **Hook dependencies**: All dependencies must be listed
- **Type-only imports**: Use `type` keyword for type imports when `verbatimModuleSyntax` is enabled

### Best Practices
1. Run linting before pushing code
2. Fix linting errors immediately, don't accumulate technical debt
3. Use auto-fix when available, but review the changes
4. Configure your IDE to show linting errors in real-time

## IDE Integration

### VS Code
Install the ESLint extension and add to your settings:
```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ]
}
```

This will:
- Show linting errors as you type
- Auto-fix fixable issues on save
- Integrate with TypeScript for better error detection

## Common Issues and Solutions

### "Unexpected any"
Replace `any` with a proper type or `unknown`:
```typescript
// Bad
const handler = (error: any) => { }

// Good
const handler = (error: unknown) => { }
// Or with proper type
const handler = (error: Error) => { }
```

### "Variable is defined but never used"
Remove the unused variable or add an underscore prefix if intentionally unused:
```typescript
// Bad
const unused = 'value';

// Good (if needed for destructuring)
const { used, _unused } = getData();
```

### "React Hook useEffect has missing dependencies"
Add all dependencies or use eslint-disable if intentional:
```typescript
// Bad
useEffect(() => {
  doSomething(value);
}, []); // Missing 'value'

// Good
useEffect(() => {
  doSomething(value);
}, [value]);
```

## Maintaining Code Quality

1. **Regular Updates**: Keep ESLint and TypeScript updated
2. **Team Standards**: Ensure all developers have the pre-commit hook installed
3. **CI/CD Integration**: Run linting in your CI pipeline as a backup
4. **Code Reviews**: Check for disabled linting rules in PRs

The pre-commit hook ensures that code quality issues are caught early, reducing bugs and maintaining a clean, consistent codebase.