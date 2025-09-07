---
allowed-tools: Read, Grep, Glob, Bash(npm test:*), Bash(npm run:*), Edit, MultiEdit, Write, TodoWrite
argument-hint: [feature description]
description: Start developing a new feature with full project context
---

# New Feature: $ARGUMENTS

Let's implement this feature for our personal budgeting application.

## Prerequisites Check
- Development servers: Run `npm run dev:check` to verify status
- If servers needed but not running: `npm run dev`
- If servers need restart: `npm run dev:restart`

## Project Context
@CLAUDE.md
@docs/AI-APPLICATION-ARCHITECTURE.md
@docs/AI-USER-STORIES.md
@docs/AI-TESTING-STRATEGY.md

## Feature Analysis

I'll develop **$ARGUMENTS** by:

1. **Understanding Requirements**
   - Reviewing how this fits with existing user stories
   - Identifying which components and services are affected
   - Checking for similar existing patterns to follow

2. **Planning Implementation**
   - Following the architecture patterns documented above
   - Using our standard development workflow from CLAUDE.md
   - Applying our risk-based testing strategy

3. **Creating Development Tasks**
   - Breaking down the feature into specific todos
   - Following our TypeScript strict mode requirements
   - Ensuring security considerations for financial data

Let me analyze the existing codebase and create a detailed plan for implementing this feature...