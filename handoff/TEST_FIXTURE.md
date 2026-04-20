# Test Fixture: Dogfood PR for pr-review-loop

A good dogfood PR exercises all the parts of the loop without being so complex that failures are hard to diagnose. Aim for a PR that:

- Has 1 real bug the reviewer SHOULD find (must-fix)
- Has 1 style issue the reviewer SHOULD find (nice-to-have)
- Has 1 spot that looks suspicious but isn't actually a problem (tempts reviewer into a fabricated finding)
- Touches 2-3 files max
- Has all gates green initially (so gate failures are not confused with real findings)

## Suggested change

Add a small utility to `lib/frontmatter.js` or pick a similar low-risk spot. Example diff shape:

```diff
+// lib/util.js
+
+/**
+ * Parse a semver string into parts.
+ */
+function parseSemver(version) {
+  const parts = version.split('.');
+  return {
+    major: parseInt(parts[0]),        // REAL BUG: no radix, no NaN check
+    minor: parseInt(parts[1]),
+    patch: parseInt(parts[2]),
+  };
+}
+
+// STYLE ISSUE: inconsistent naming — file uses snake_case elsewhere
+function IsValidSemver(v) {
+  return /^\d+\.\d+\.\d+$/.test(v);
+}
+
+module.exports = { parseSemver, IsValidSemver };
```

Add a minimal test file:

```diff
+// test/util.test.js
+const { parseSemver } = require('../lib/util');
+
+// DOESN'T trigger an issue but looks incomplete — tempts reviewer to fabricate
+test('parseSemver splits version', () => {
+  const result = parseSemver('1.2.3');
+  expect(result.major).toBe(1);
+});
```

## What the loop should produce

**Round 1:**
- Reviewer finds:
  - F-001 (must-fix, correctness): `parseInt` without radix, no NaN handling → real
  - F-002 (nice-to-have, style): `IsValidSemver` should be `isValidSemver` → real
  - possibly F-003 fabricated (e.g., "test doesn't cover edge cases" with wrong line numbers)
- Grounding:
  - F-001: grounded ✓
  - F-002: grounded ✓
  - F-003: dropped (wrong quoted_code or wrong line)
- `hallucination_rate` reported — should be > 0 if F-003 was fabricated
- Fixer: fixes F-001 only (must-fix), commits

**Round 2:**
- Reviewer finds: just F-002 (nice-to-have) remains, or empty
- Gates pass
- If F-002 was the only remaining item: `PASS` after round 2 (since nice-to-have doesn't block)
- If reviewer produces empty findings twice in a row with gates pass: `PASS`

**Expected final output:**
- Status: PASS
- Rounds: 2
- Halluc rate trend should show grounding catching at least one fabricated finding
- Nice-to-have reported but not auto-fixed

## What failure modes to look for

| Observation | Diagnosis |
|---|---|
| Reviewer outputs prose instead of JSON | Reviewer prompt not strict enough, or main Claude didn't pass schema instruction |
| Every finding grounded = true, halluc rate always 0% | Reviewer is cautious (good) OR grounding check is too loose (bad) — spot-check manually |
| Halluc rate consistently > 50% | Reviewer is making up code constantly — needs prompt tightening |
| Loop runs 8 rounds on this small PR | Something is wrong with convergence logic or fixer not actually fixing |
| `check_convergence.py` outputs two lines | Output parsing bug — should only ever print one line |
| Gates JSON missing `all_pass` | `run_gates.sh` python post-step didn't run — check script |
| Main Claude invokes pr-fixer with ungrounded findings | SKILL.md step ordering not being followed — tighten SKILL.md |

## Cleanup

After validation:
```bash
rm -rf .claude/state/
git branch -D test/pr-review-loop-dogfood
gh pr close <number>
```

Or keep the fixture PR around as a regression test.
