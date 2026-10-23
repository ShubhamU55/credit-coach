<!-- Adapted from affaan-m/ECC (MIT) @ 90606c8 -->

# Testing Requirements

## Coverage

- `packages/engine`: ≥ 90% line coverage (pure logic, TDD target).
- `apps/*`: covered by E2E flows (Maestro for mobile, Playwright for admin) rather than a percentage.

Test Types (ALL required):

1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (framework chosen per language)

## Test-Driven Development

MANDATORY workflow:

1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (engine ≥ 90% lines)

## Troubleshooting Test Failures

1. Use the **implementer** agent (superpowers TDD, test-first) or **test-automator** (test infrastructure; quarantines a pre-identified flaky test from an explicit `flaky[]` input, never a silent skip)
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

## Agent Support

- **implementer** - Use PROACTIVELY for new features, enforces write-tests-first (superpowers `test-driven-development`)
- **test-automator** - Owns the test automation infrastructure; wires acceptance criteria and tester proposals into durable automated tests

## Test Structure (AAA Pattern)

Prefer Arrange-Act-Assert structure for tests:

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0];
  const vector2 = [0, 1, 0];

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2);

  // Assert
  expect(similarity).toBe(0);
});
```

### Test Naming

Use descriptive names that explain the behavior under test:

```typescript
test('returns empty array when no markets match query', () => {});
test('throws error when API key is missing', () => {});
test('falls back to substring search when Redis is unavailable', () => {});
```
