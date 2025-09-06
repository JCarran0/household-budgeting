---
allowed-tools: Read, Grep, Glob, Bash(npm test:*), Bash(npm run:*), Bash(node:*), Bash(cat:*), Bash(ls:*), Bash(git log:*), Bash(git diff:*), WebSearch
argument-hint: [issue description]
description: Systematic debugging workflow for reported issues
---

# Debug Issue: $ARGUMENTS

I'll help you debug this issue using a systematic approach. Let me analyze the problem and guide you through the debugging process.

## Initial Analysis

First, let me understand:
1. What is the reported issue: **$ARGUMENTS**
2. When did this start happening (check recent changes)
3. What are the symptoms vs root cause
4. Is this reproducible consistently

## Debugging Steps

### Step 1: Gather Context
- Review error messages, logs, or stack traces
- Check recent git commits for related changes
- Identify which components/services are affected

### Step 2: Reproduce the Issue
- Determine exact steps to reproduce
- Check if issue is environment-specific
- Verify prerequisites and dependencies

### Step 3: Isolate the Problem
- Narrow down to specific file/function/line
- Check related unit/integration tests
- Review similar working code for comparison

### Step 4: Investigate Root Cause
Based on the issue type, check for:

#### If it's a Runtime Error:
- TypeScript type mismatches
- Null/undefined references  
- Async/await issues
- API contract violations

#### If it's a Logic Error:
- Business logic conditions
- State management issues
- Data flow problems
- Edge cases not handled

#### If it's a Performance Issue:
- N+1 queries
- Missing pagination
- Inefficient algorithms
- Memory leaks

#### If it's an Integration Issue:
- External service failures (Plaid, S3)
- Authentication/authorization problems
- Network/connectivity issues
- Configuration mismatches

### Step 5: Review Documentation
Check relevant documentation for:
- Known issues or gotchas
- API/service documentation
- Configuration requirements
- Breaking changes in dependencies

### Step 6: Develop Solution
- Identify minimal fix vs proper solution
- Consider backward compatibility
- Plan for error handling
- Think about test coverage

### Step 7: Verify Fix
- Test the specific issue
- Run related test suites
- Check for regression
- Verify in different scenarios

## Common Issues Reference

### Authentication Issues
- Check JWT_SECRET environment variable
- Verify token expiration settings
- Review rate limiting logs
- Check bcrypt rounds configuration

### Plaid Integration Issues  
- Verify PLAID_ENV matches credentials (sandbox/development/production)
- Check PLAID_PRODUCTS configuration (don't include "accounts")
- Review access token encryption
- Check for expired tokens needing refresh

### Transaction Issues
- Verify account sync status
- Check date range limits (730 days max)
- Review categorization rules
- Check for orphaned category IDs

### Storage Issues
- Verify STORAGE_TYPE setting (filesystem/s3)
- Check file permissions
- Review S3 bucket configuration
- Verify data directory exists

### Frontend Issues
- Check API endpoint URLs
- Review CORS configuration
- Verify component state management
- Check for React Query cache issues

### Database/Data Issues
- Check data file corruption
- Verify user isolation
- Review concurrent access handling
- Check for race conditions

## Output Format

After analysis, I'll provide:

1. **Issue Summary**: Clear description of the problem
2. **Root Cause**: The underlying reason for the issue
3. **Impact Analysis**: What's affected and severity
4. **Recommended Fix**: Step-by-step solution
5. **Test Plan**: How to verify the fix works
6. **Prevention**: How to avoid similar issues

## Let's begin debugging...

Now I'll start investigating the reported issue: **$ARGUMENTS**