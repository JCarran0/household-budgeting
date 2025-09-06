# Review Tests Command

Review testing requirements for changes made in this Claude Code session according to our testing strategy.

## Testing Strategy Documentation
@docs/AI-TESTING-STRATEGY.md

## User Stories Documentation  
@docs/AI-USER-STORIES.md

## Instructions

1. **Review our testing strategy**: From the included AI-TESTING-STRATEGY.md above, focus on:
   - Section "Core Testing Principles" - understand our risk-based approach
   - Section "Test Suite Organization" - know where different tests belong
   - Section "When to Add Tests" - decision criteria for test creation
   - Section "Anti-Patterns" - what to avoid

2. **Analyze session changes** and categorize by risk:
   - **Critical**: Changes affecting money, security, or authentication
   - **High**: Data integrity, multi-user isolation, or core business logic
   - **Medium**: User experience, non-critical features
   - **Low**: Cosmetic, formatting, or documentation

3. **Generate test review report** using the format below

## Output Format

```markdown
## Test Review Report

### Session Changes Analysis
[Brief summary of what was modified in this session]

### Changes Requiring Tests

#### Critical Risk
- [ ] Change: [description]
      Location: [file:line]
      Test needed: [critical/integration] in [suggested test file]
      User story: [reference from AI-USER-STORIES.md]

#### High Risk
- [ ] Change: [description]
      Location: [file:line]  
      Test needed: [integration/manual] in [suggested test file]
      User story: [reference from AI-USER-STORIES.md]

#### Medium/Low Risk
- [ ] [List any medium/low risk items or state "None identified"]

### Tests Added This Session
[If no tests were added, state "No tests were added"]
- ✅ [Test file]: Follows strategy - [validates complete user workflow]
- ⚠️ [Test file]: Needs adjustment - [too isolated/mocked/trivial]

### Compliance Check
- [ ] Tests follow integration-over-unit principle (per AI-TESTING-STRATEGY.md)
- [ ] Tests validate complete user stories (per AI-USER-STORIES.md)
- [ ] Critical paths have coverage (auth, money, data integrity)
- [ ] No unnecessary mocking of Plaid or storage services

### Recommended Actions
1. [Most critical missing test to add immediately]
2. [Next priority test to add]
3. [Any test refactoring needed]
```

## Important Reminders
- Testing strategy and user stories are included above for reference
- Skip trivial tests (getters, setters, formatters) per our strategy
- Use real Plaid sandbox, not mocks, for integration tests
- Focus on user workflows, not isolated functions

## Quick Reference Test Locations
- Critical tests: `backend/src/__tests__/critical/`
- Integration tests: `backend/src/__tests__/integration/`
- Frontend tests: `frontend/src/__tests__/stories/`