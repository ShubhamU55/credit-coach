<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

# Code Review Standards

Code review ensures quality, security, and maintainability before code is merged. This rule defines when and how to conduct code reviews. The quality bar it checks against lives in [coding-style.md](./coding-style.md).

## When to Review

**MANDATORY review triggers:**

- After writing or modifying code
- Before any commit to shared branches
- When security-sensitive code is changed (auth, payments, user data)
- When architectural changes are made
- Before merging pull requests
- Pre-review: CI passing, merge conflicts resolved, branch up to date with target

## Review Checklist

- [ ] Meets [coding-style.md](./coding-style.md): readable names, small functions/files, shallow nesting, immutable updates, no hardcoded secrets
- [ ] No `console.log` or debug statements
- [ ] Tests exist for new functionality
- [ ] Engine coverage ≥ 90% lines; app changes covered by an E2E flow

## Security Review Triggers

**STOP and use security-reviewer agent when:**

- Authentication or authorization code
- User input handling
- Database queries
- File system operations
- External API calls
- Cryptographic operations
- Payment or financial code

## Review Severity Levels

| Level    | Meaning                                                                                      | Action                             |
| -------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| CRITICAL | Security vulnerability or data loss risk                                                     | **BLOCK** - Must fix before merge  |
| HIGH     | Bug or significant quality issue                                                             | **WARN** - Should fix before merge |
| MEDIUM   | Maintainability concern, including an unexplained source file over the soft 800-line ceiling | **INFO** - Consider fixing         |
| LOW      | Style or minor suggestion                                                                    | **NOTE** - Optional                |

## Agent Usage

| Agent                     | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| **code-reviewer**         | General code quality, patterns, best practices             |
| **security-reviewer**     | Security vulnerabilities, OWASP Top 10                     |
| **typescript-reviewer**   | TypeScript/JavaScript specific issues                      |
| **react-reviewer**        | React/JSX issues (`.tsx`)                                  |
| **silent-failure-hunter** | Swallowed errors, bad fallbacks, missing error propagation |

## Review Workflow

1. Run `git diff` to understand changes
2. Check the security triggers above first
3. Run the relevant tests; verify engine coverage ≥ 90% lines
4. Use the appropriate specialist agent for detailed review

## Common Issues to Catch

- **Security:** hardcoded credentials, SQL injection, XSS, path traversal, missing CSRF protection, auth bypasses
- **Performance:** N+1 queries, missing pagination/constraints, missing caching on expensive operations

## Approval Criteria

- **Approve:** no CRITICAL or HIGH issues
- **Warning:** only HIGH issues (merge with caution)
- **Block:** CRITICAL issues found

## Integration with Other Rules

- [testing.md](./testing.md) - Test coverage requirements
- [security.md](./security.md) - Security checklist
- [git-workflow.md](./git-workflow.md) - Commit standards
- [agents.md](./agents.md) - Agent roster and delegation
