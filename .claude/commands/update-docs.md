# Update Documentation Command

Review changes made in this Claude Code session and intelligently determine if AI documentation updates are needed.

## Purpose

This command helps maintain accurate, up-to-date documentation optimized for AI agent consumption. It reviews session changes against specific criteria to avoid unnecessary documentation churn while ensuring critical updates aren't missed.

## Current Documentation Files

### Main Project Guide
@CLAUDE.md

### Architecture Documentation
@docs/AI-APPLICATION-ARCHITECTURE.md

### Deployment Documentation
@docs/AI-DEPLOYMENTS.md

### Testing Strategy
@docs/AI-TESTING-STRATEGY.md

### User Stories
@docs/AI-USER-STORIES.md

### Architecture Plan
@docs/AI-Architecture-Plan.md

## Instructions

### 1. Analyze Session Changes

Review all changes made during the current Claude Code session:
- Code modifications (new files, edited files, deleted files)
- Configuration changes (environment variables, dependencies)
- Infrastructure modifications (deployment scripts, CI/CD)
- Test additions or modifications
- Bug fixes and their root causes

### 2. Apply Documentation Update Criteria

Documentation should ONLY be updated when changes meet these criteria:

#### **MUST Update** - Critical Changes
- **Breaking changes**: Modified API contracts, removed endpoints, changed auth flow
- **New major features**: Complete user stories or significant functionality
- **Security changes**: New security requirements or authentication modifications
- **Infrastructure changes**: New deployment methods, storage backends, or services
- **Critical bug fixes**: Solutions to data loss, security issues, or system failures
- **User story updates or additions**: Changes to business requirements should always be documented.

#### **SHOULD Update** - Important Patterns
- **New architectural patterns**: Service patterns, state management, or data flow
- **Significant refactoring**: Changes affecting how developers interact with code
- **New integration points**: External services, APIs, or third-party libraries
- **Performance optimizations**: Solutions to documented performance issues
- **Common gotchas**: Newly discovered issues that future agents will encounter

#### **MAY Update** - Minor Improvements
- **Clarifications**: If existing docs caused confusion during the session
- **Missing examples**: If you had to figure out something undocumented
- **Outdated references**: File paths, method names, or configurations that changed

#### **SKIP Update** - Trivial Changes
- **Bug fixes**: Unless they reveal important patterns or gotchas
- **UI tweaks**: Minor styling or layout changes
- **Code cleanup**: Formatting, comments, or non-functional changes
- **Test additions**: Unless they demonstrate new testing patterns
- **Documentation typos**: Unless they cause actual confusion

### 3. Review Each Documentation File

With the documentation files included above, check each for potential updates:

| Document | Check For |
|----------|-----------|
| **CLAUDE.md** | Project structure changes, new dependencies, development workflow updates, common task instructions |
| **AI-APPLICATION-ARCHITECTURE.md** | Service changes, API modifications, component patterns, data flow updates |
| **AI-DEPLOYMENTS.md** | Infrastructure changes, CI/CD updates, environment variables, deployment procedures |
| **AI-TESTING-STRATEGY.md** | New testing patterns, critical test examples, anti-patterns discovered |
| **AI-USER-STORIES.md** | New features, modified acceptance criteria, completed stories |
| **AI-Architecture-Plan.md** | Cost changes, infrastructure decisions, risk assessments |

### 4. Generate Documentation Review Report

## Output Format

```markdown
## Documentation Review Report

### Session Summary
[Brief description of work completed in this session - 2-3 sentences]

### Changes Analysis

#### Code Changes
- Files modified: [count]
- Features added: [list or "none"]
- Bugs fixed: [list or "none"]
- Breaking changes: [list or "none"]

#### Impact Assessment
[Which areas of the system were affected and how]

### Documentation Status

#### Updates Recommended

##### [Document Name] - [Priority: CRITICAL/HIGH/MEDIUM]
**Reason**: [Why this needs updating based on criteria]
**Specific Updates**:
- [ ] Section: [section name] - [what to add/modify]
- [ ] Add example: [what example is needed]
- [ ] Update reference: [what's outdated]

[Repeat for each document needing updates]

#### No Updates Needed
[List documents that were reviewed but don't need updates]
- **CLAUDE.md**: Current documentation remains accurate
- **AI-TESTING-STRATEGY.md**: No new patterns introduced
[etc.]

### New Documentation Considerations

#### Should Create
[Only if genuinely needed]
- **docs/AI-[TOPIC].md**: [Justification - what gap does this fill?]

#### Knowledge Gaps Identified
[Areas where documentation could be helpful but isn't critical]
- [Topic]: Would help with [use case] but not blocking

### Recommendations

#### Immediate Actions
1. [Most critical update if any]
2. [Second priority if any]

#### Future Considerations
- [Documentation debt to address later]
- [Patterns to document once stable]

### Conclusion
[One of the following]:
- ✅ **No documentation updates needed** - Changes don't meet update criteria
- 📝 **Minor updates recommended** - Small clarifications would help
- ⚠️ **Important updates needed** - Documentation accuracy affected
- 🚨 **Critical updates required** - Breaking changes or major features undocumented
```

## Important Guidelines

### DO:
- Be selective - only recommend updates that add real value
- Consider AI agent needs - optimize for machine readability
- Check for accuracy - ensure existing docs aren't now wrong
- Think about discoverability - will agents find what they need?
- Suggest consolidation if documentation is fragmented

### DON'T:
- Update for the sake of updating
- Add verbose explanations that don't help agents
- Duplicate information across multiple docs
- Create new docs unless there's a clear gap
- Update timestamps or version numbers unnecessarily

## Quick Decision Tree

```
Did the session involve:
├─ Breaking changes or removed features?
│  └─ YES → MUST update affected docs
├─ New major features or services?
│  └─ YES → MUST document in appropriate guide
├─ Critical bug fixes revealing patterns?
│  └─ YES → SHOULD update with gotchas/solutions
├─ New architectural patterns?
│  └─ YES → SHOULD update architecture guide
├─ Performance or security fixes?
│  └─ YES → SHOULD document if generally applicable
├─ Minor improvements or clarifications?
│  └─ MAYBE → Only if current docs are misleading
└─ Routine bug fixes or cleanup?
   └─ NO → Skip documentation updates
```

## Examples of Good vs Bad Updates

### ✅ Good Update Reasons
- "Added new S3 storage backend option - AI-DEPLOYMENTS.md needs storage configuration section"
- "Discovered Plaid pagination limit of 500 - AI-APPLICATION-ARCHITECTURE.md should document this constraint"
- "Refactored all services to singleton pattern - pattern should be documented for consistency"
- "Fixed critical auth bypass - security considerations should be added to CLAUDE.md"

### ❌ Bad Update Reasons
- "Fixed typo in variable name - should update docs" (too minor)
- "Added console.log for debugging - should document" (temporary change)
- "Improved button styling - should update architecture" (not architectural)
- "Wrote new test - should update test strategy" (unless it's a new pattern)

## Related Commands
- `/review-tests` - Review testing requirements for session changes