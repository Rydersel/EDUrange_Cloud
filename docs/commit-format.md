# Commit Message Format for EDURange Cloud

## Overview

Good commit messages help team members understand changes quickly. This document outlines a simple format for commit messages in the EDURange Cloud project.

## Basic Format

```
<type>: <short summary>

<details> (optional)
```

### Type

Use one of these types to categorize your change:

- **feat** - New feature
- **fix** - Bug fix
- **docs** - Documentation changes
- **test** - Test-related changes
- **refactor** - Code restructuring
- **style** - Formatting changes
- **chore** - Maintenance tasks

### Summary

- Keep it short (under 50 characters)
- Use present tense ("add feature" not "added feature")
- Be specific about what changed

### Details (Optional)

If needed, add more information about:
- Why the change was made
- What problem it solves
- Any important implementation details

## Examples

### Simple Fix

```
fix: resolve login button not working on mobile

Fixed responsive styling issues that prevented the login button 
from being clickable on small screens.
```

### New Feature

```
feat: add student leaderboard

Added a new leaderboard that shows top-performing students
across all challenges. Includes filtering by date range.
```

### Documentation

```
docs: update installation instructions

Updated the README with clearer steps for setting up the
development environment on both Windows and Mac.
```

### Multiple Changes

```
chore: clean up test environment

- Removed unused test fixtures
- Fixed flaky tests in auth module
- Added better error messages for failed assertions
```

## Best Practices

- One logical change per commit
- Explain why the change was made, not just what changed
- Reference issue numbers when applicable (#123)
- Think about what would help other developers understand your changes 
