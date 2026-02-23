# Code Review Command

**Purpose:** Multi-agent code review with cross-verification. Three models (Opus, Sonnet, Haiku) independently review the same code, then verify each other's findings to eliminate false positives/negatives.

**Prerequisites:** Work committed on feature/bugfix/chore branch · Jira issue exists · Changes exist vs develop

---

## Expected Output

```
🔍 Multi-Agent Code Review: DEV-XXXX - [Issue Title]
Branch: feature/dev-xxxx | Status: ✅ Ready / ⚠️ Needs Work / ❌ Blocking | Commits: X | Files: Y
Review Method: Opus + Sonnet + Haiku with Cross-Verification
Confidence: N HIGH · N MEDIUM · N LOW · N DISPUTED
✅ Strengths · ⚠️ Suggestions · ❌ Issues · 📊 Coverage · 🔒 Security · ⚡ Performance
```

---

## Phase 1: Context Gathering (Steps 1-4)

**Outputs:** {branch_name}, {issue_key}, {issue_title}, {issue_description}, {subtasks}, {issue_status}

1. Run `git rev-parse --abbrev-ref HEAD` → SAVE as {branch_name}

2. **✅ CHECKPOINT** — Extract issue key
   - IF {branch_name} matches `^(feature|bugfix|chore)/`: EXTRACT `(DEV-\d+)` → SAVE as {issue_key}
   - ELSE: ASK "What's the Jira issue key? (e.g., DEV-2510)" → SAVE response as {issue_key}
   - IF {issue_key} empty: REPORT "❌ Cannot proceed without issue key" → STOP

3. Fetch Jira issue: `mcp_mcp-atlassian_jira_get_issue` with `issue_key`, fields `"key,summary,description,status,issuetype,subtasks,comment"`, comment_limit 5 → SAVE as {issue_data}

4. **✅ CHECKPOINT** — Verify issue
   - IF {issue_data}.key === {issue_key}: EXTRACT summary→{issue_title}, description→{issue_description}, subtasks→{subtasks}, status→{issue_status} · OUTPUT "✅ Retrieved {issue_key}: {issue_title}"
   - ELSE: REPORT "❌ Failed to retrieve {issue_key}" → STOP

---

## Phase 2: Issue Completeness (Steps 5-7)

**Outputs:** {incomplete_subtasks}, {acceptance_criteria}

5. ITERATE {subtasks}: collect all NOT "Done" → SAVE as {incomplete_subtasks}

6. **✅ CHECKPOINT** — Subtask completeness
   - IF all Done: OUTPUT "✅ All subtasks completed"
   - ELSE: LIST incomplete subtasks · ASK "Continue review anyway? (yes/no)" · IF no: STOP

7. SEARCH {issue_description} for "Acceptance Criteria" / "AC:" / "Definition of Done" / `- [ ]` items
   - IF found: SAVE as {acceptance_criteria} · OUTPUT "✅ Acceptance criteria found"
   - ELSE: SET {acceptance_criteria} = {issue_description} · OUTPUT "⚠️ No explicit criteria — using full description"

---

## Phase 3: Branch & Diff Analysis (Steps 8-12)

**Outputs:** {commit_count}, {commit_list}, {diff_output}, {diff_stats}, {file_categories}

8. Run `git log develop..HEAD --oneline` → SAVE as {commit_list}, COUNT lines → {commit_count}

9. **✅ CHECKPOINT** — IF {commit_count} === 0: REPORT "❌ No commits found on branch vs develop" → STOP

10. Run `git diff develop...HEAD --stat` → {diff_stats} · Run `git diff develop...HEAD` → {diff_output}

11. **✅ CHECKPOINT** — IF diff empty: STOP · IF >100K chars: TRUNCATE to source + functions only, WARN "Diff truncated for agent processing"

12. CATEGORIZE files from {diff_stats}:
    - {source_files}: `src/**/*.ts` excluding `*.spec.ts`
    - {templates}: `src/**/*.html`
    - {styles}: `src/**/*.scss`
    - {tests}: `src/**/*.spec.ts`
    - {functions}: `functions/src/**/*.ts` excluding spec/tests
    - {function_tests}: `functions/src/**/*.spec.ts` or `**/tests/**`
    - OUTPUT `📊 Source:{n} Templates:{n} Styles:{n} Tests:{n} Functions:{n}`

---

## Phase 4: Review Context Assembly (Step 13)

**Outputs:** {review_context_payload}, {active_review_domains}

13. BUILD {review_context_payload} and determine {active_review_domains}:
    - Architecture: ALWAYS active
    - TypeScript: ALWAYS active
    - Angular: IF {templates}.length > 0 OR {source_files} contains "component.ts"
    - Firebase: IF {functions}.length > 0
    - Tests, Security, Performance: ALWAYS active
    - OUTPUT "✅ Review plan: Architecture, TypeScript" + (if applicable) ", Angular, Firebase"
    - OUTPUT "🤖 Launching 3 independent reviewers: Opus, Sonnet, Haiku..."

---

## Phase 5: Parallel Independent Review (Steps 14-16)

> **Launch all three Task calls IN PARALLEL. Each agent runs the same checklist independently.**

**Outputs:** {opus_findings}, {sonnet_findings}, {haiku_findings}

FOR EACH of steps 14, 15, 16 — use the `Task` tool with `subagent_type="general-purpose"` and the specified `model`. Pass the IDENTICAL prompt below, substituting the actual values for all `{variables}`.

14. **Launch Opus Review** — `Task(model="opus")`
15. **Launch Sonnet Review** — `Task(model="sonnet")`
16. **Launch Haiku Review** — `Task(model="haiku")`

### Subagent Review Prompt Template

```
# Independent Code Review Analysis

You are performing an independent code review. Analyze the diff and context below thoroughly.
Two other reviewers are analyzing the same code independently. Your findings will be cross-verified,
so be precise and honest — do not inflate or understate issues.

## Context

**Issue:** {issue_key} - {issue_title}
**Description:** {issue_description}
**Acceptance Criteria:** {acceptance_criteria}
**Branch:** {branch_name}
**Commits:** {commit_count}

## File Categories

- Source files: {source_files list}
- Templates: {templates list}
- Styles: {styles list}
- Tests: {tests list}
- Functions: {functions list}

## Active Review Domains

{active_review_domains}

## Diff Output

{diff_output}

## Review Checklist

Analyze the diff against EACH applicable checklist item. For every finding, provide the exact
file path and line reference from the diff (e.g., `file.ts:L42`).

### Architecture
- Single Responsibility: Does each file have one clear purpose?
- SOLID principles: Open/Closed, Liskov, Interface Segregation, Dependency Inversion
- Separation of Concerns: Business logic in services (not components), no side effects in UI
- Error Handling: try-catch on async operations, user notification on errors
- Maintainability: Self-documenting names, no magic numbers

### Angular (if applicable)
- Components should use ChangeDetectionStrategy.OnPush
- Use inject() instead of constructor injection
- Use input()/output()/model() instead of @Input/@Output decorators (deprecated)
- Use @if/@for/@switch instead of *ngIf/*ngFor/*ngSwitch
- Use [class.x]/[style.x] instead of ngClass/ngStyle (deprecated)
- Use signal(), computed(), linkedSignal() for state management
- Use resource()/rxResource() for async data (not manual signal + fetch)
- Use takeUntilDestroyed() or DestroyRef for cleanup (not OnDestroy)
- Always include track in @for loops

### TypeScript
- No `any` usage — use proper types; use `unknown` with type guards when type is uncertain
- Type assertions (`as` keyword): flag if > 3 occurrences as excessive
- Non-null assertions (`!`): must be justified, flag if unjustified
- Explicit parameter and return types on functions
- Use utility types where appropriate: Record, Partial, Pick, Omit, Readonly, satisfies
- Use discriminated unions for state management
- Use `import type` for type-only imports

### Firebase (if applicable)
- Functions v2 SDK (firebase-functions/v2), NOT v1
- Input validation with Zod or joi
- Auth verification (Firebase ID token) on all endpoints
- Authorization check (user owns resource) before data access
- Proper HTTP status codes (200/400/401/403/500)
- try-catch on all async operations
- Never expose internal errors to clients (generic 500 message)
- Batch operations for Firestore writes (max 500 per batch)
- Efficient queries: limits, where clauses, proper indexing

### Test Coverage
- Each source/function file should have a corresponding .spec.ts
- Calculate coverage: (files with tests) / (total source files) * 100
- Test quality: Arrange-Act-Assert pattern, descriptive names ("should X when Y")
- Behavior-focused (not implementation details), proper mocking with ng-mocks

### Security
- No hardcoded credentials (password, apiKey, secret, token as string literals)
- No string concatenation in database queries (injection risk)
- No innerHTML or bypassSecurityTrust usage (XSS risk)
- Input validation present on user-facing inputs
- No insecure HTTP URLs (http:// in non-comment code)

### Performance
- No nested loops on large datasets
- computed() used for derived state (not recalculated in template)
- OnPush change detection + signals on components
- No expensive operations (HTTP calls, complex calculations) inside loops

### Completeness & Scope
- Are acceptance criteria / requirements addressed by the changes?
- Any TODO/FIXME/HACK/TEMP comments left in new code?
- Edge cases handled: null/undefined inputs, empty arrays, async errors
- All changes related to the issue? (flag scope drift)
- DRY: no duplicated logic across files

## Required Output Format

Return findings in EXACTLY this format. Every finding MUST have a file:line reference.

### STRENGTHS
- [ARCH] file.ts:L42 - Description
- [TS] file.ts:L15 - Description
(list all strengths found)

### WARNINGS
- [ANGULAR] file.html:L12 - Description
- [PERF] file.ts:L30 - Description
(list all warnings found)

### ISSUES
- [TS] file.ts:L88 - Description of blocking issue
- [SECURITY] file.ts:L102 - Description of blocking issue
(list all blocking issues found)

### TEST_COVERAGE
- coverage_percent: XX%
- missing_tests: [list of files without corresponding .spec.ts, or "None"]
- test_quality_notes: Brief assessment of test quality

### SUMMARY
- total_strengths: N
- total_warnings: N
- total_issues: N
- overall_assessment: EXCELLENT | GOOD | NEEDS_WORK | BLOCKING
- key_concern: One sentence summary of the biggest concern, or "None"
```

**✅ CHECKPOINT** — After all three agents return:
- IF any agent returned empty: WARN "⚠️ {agent_name} returned no results — continuing with {n} agents"
- IF all agents failed: REPORT "❌ Multi-agent review failed" → Fallback: run single-agent review in main thread
- ELSE: OUTPUT "✅ All 3 reviewers completed. Opus: {n} findings, Sonnet: {n} findings, Haiku: {n} findings"

---

## Phase 6: Cross-Verification (Steps 17-19)

> **Launch all three Task calls IN PARALLEL. Each agent verifies the OTHER two agents' findings.**

**Outputs:** {opus_verification}, {sonnet_verification}, {haiku_verification}

17. **Launch Opus Cross-Verification** — `Task(model="opus")` — reviews {sonnet_findings} + {haiku_findings}
18. **Launch Sonnet Cross-Verification** — `Task(model="sonnet")` — reviews {opus_findings} + {haiku_findings}
19. **Launch Haiku Cross-Verification** — `Task(model="haiku")` — reviews {opus_findings} + {sonnet_findings}

### Subagent Cross-Verification Prompt Template

```
# Cross-Verification Review

You are cross-verifying the code review findings of two other reviewers. Your job is to check each
finding against the actual diff and provide an honest verdict:

1. **CONFIRMED** — The finding is correct and well-reasoned
2. **DISPUTED** — The finding is incorrect, exaggerated, or misidentified (you MUST explain why)
3. **NEW** — A finding that BOTH reviewers missed (you see it in the diff but neither reported it)

Be rigorous. Do NOT rubber-stamp. Actually check each finding against the diff.
A false positive wastes developer time. A false negative lets bugs through.

## Original Context

**Issue:** {issue_key} - {issue_title}
**Acceptance Criteria:** {acceptance_criteria}

## Diff Output

{diff_output}

## Reviewer A Findings ({reviewer_a_name})

{reviewer_a_findings}

## Reviewer B Findings ({reviewer_b_name})

{reviewer_b_findings}

## Required Output Format

For EACH finding from both reviewers, provide a verdict. Then list any NEW findings both missed.
Use the exact format below.

### VERIFICATION_OF_{reviewer_a_name}

#### STRENGTHS
- [CONFIRMED] file.ts:L42 - {original description}
- [DISPUTED] file.ts:L15 - {original description} -- Reason: {why this is wrong}

#### WARNINGS
- [CONFIRMED] file.ts:L30 - {original description}
- [DISPUTED] file.ts:L12 - {original description} -- Reason: {why this is wrong}

#### ISSUES
- [CONFIRMED] file.ts:L88 - {original description}
- [DISPUTED] file.ts:L102 - {original description} -- Reason: {why this is wrong}

### VERIFICATION_OF_{reviewer_b_name}

(same structure as above)

### NEW_FINDINGS

#### STRENGTHS
- [NEW] file.ts:L55 - Description of missed strength

#### WARNINGS
- [NEW] file.ts:L77 - Description of missed warning

#### ISSUES
- [NEW] file.ts:L99 - Description of missed blocking issue

### CROSS_VERIFICATION_SUMMARY
- confirmed_count: N
- disputed_count: N
- new_findings_count: N
```

**✅ CHECKPOINT** — After all three cross-verifiers return:
- IF any cross-verifier failed: WARN "⚠️ {agent_name} cross-verification failed — computing confidence with {n}/3 verifiers"
- ELSE: OUTPUT "✅ Cross-verification complete. Confirmed: {n}, Disputed: {n}, New: {n}"

---

## Phase 7: Synthesis & Confidence Scoring (Steps 20-22)

**Outputs:** {synthesized_findings}, {confidence_summary}, {assessment}

20. **Merge findings** — FOR EACH unique finding (deduplicated by file:line + category):
    - COUNT how many agents originally found it (sources: 0-3)
    - COUNT how many cross-verifiers confirmed it (confirmations: 0-2)
    - CHECK if any cross-verifier disputed it (disputed: true/false + reason)
    - RECORD attribution: which agent(s) found it, which confirmed/disputed

21. **Compute confidence** — FOR EACH finding apply:

    | Confidence | Rule |
    |-----------|------|
    | **HIGH** | Found by 2+ agents, OR found by 1 + confirmed by both cross-verifiers, no disputes |
    | **MEDIUM** | Found by 1 + confirmed by 1 cross-verifier, OR found by 2+ but 1 disputes |
    | **LOW** | Found by 1 agent only, no confirmations from cross-verifiers |
    | **DISPUTED** | Found by 1 agent, explicitly disputed by a cross-verifier with reasoning |

    - NEW findings from cross-verification: START at LOW, upgrade to MEDIUM if found by 2+ cross-verifiers

22. **Overall assessment** — COUNT across all synthesized findings:
    - `blocking_issues` = COUNT of ISSUES with confidence HIGH or MEDIUM
    - `suggestions` = COUNT of WARNINGS with confidence HIGH or MEDIUM
    - `strengths` = COUNT of STRENGTHS with confidence HIGH or MEDIUM
    - `disputed_count` = COUNT of DISPUTED findings
    - IF blocking > 0 → "❌ Blocking Issues"
    - IF suggestions > 5 → "⚠️ Needs Work"
    - IF suggestions > 0 → "✅ Good"
    - ELSE → "✅ Excellent"
    - {pr_ready}: IF blocking > 0 → "Not yet — fix blocking issues" · ELSE "Yes — ready for team review"
    - **✅ CHECKPOINT**: OUTPUT summary with confidence distribution

---

## Phase 8: Acceptance Criteria & Subtask Verification (Step 23)

**Outputs:** {criteria_verification}, {subtask_verification}

23. **Verify against requirements** using synthesized findings:
    - **Acceptance Criteria**: FOR EACH criterion MARK ✅ Verified / ⚠️ Unclear / ❌ Not addressed
      - IF no explicit criteria: SET {criteria_verification} = "Manual review required"
    - **Subtask Verification**: FOR EACH subtask SEARCH related changes in {diff_output}
      - IF "test" in summary: CHECK new test files exist → ASSESS ✅ / ⚠️ / ❌

---

## Phase 9: Final Verification Pass (Steps 24-29)

**Approach:** Act as a skeptical senior engineer — assume things can go wrong. Verify, don't trust.

24. **Requirement solved?** — REVIEW {acceptance_criteria} vs {diff_output}
    - SEARCH for "TODO"/"FIXME"/"HACK"/"TEMP" · IF gaps: "❌ Requirement not fully solved: {describe}"

25. **Edge cases handled?** — FOR EACH function: null/undefined inputs? empty arrays? async errors caught?
    - MISSING → "⚠️ Unhandled edge case: {describe}"

26. **Run tests** — `npm run test -- --watchAll=false 2>&1 | tail -30` — SHOW actual output, do not summarize
    - FAILING → "❌ Tests failing: {output}"

27. **Regressions** — IDENTIFY changed functions/components → `Grep` for callers in codebase
    - IF callers could break: "⚠️ Potential regression: {file} calls {changed_function}"

28. **Scope drift** — Are ALL changes in {diff_output} related to {issue_description}?
    - Unrelated changes → "⚠️ Scope drift: {describe}"

29. **DRY & design patterns** — Duplicated logic? Magic numbers? Pattern opportunities?
    - Violations → "⚠️ DRY violation: {describe}" · Opportunity → "💡 Consider {pattern}: {describe}"
    - **✅ CHECKPOINT — Final Verdict**:
      - No gaps → "✅ Implementation is solid." → {final_verdict} = "approved"
      - Warnings only → "⚠️ Minor gaps — review before merging." → {final_verdict} = "approved with notes"
      - Blocking (❌) → "❌ Verification failed — address before PR." → {final_verdict} = "blocked"

---

## Phase 10: Report Compilation (Steps 30-31)

30. **ASSEMBLE {review_report}**:

```markdown
# Multi-Agent Code Review: {issue_key} - {issue_title}
**Branch:** {branch_name} | **Commits:** {commit_count} | **Files:** {total} | **Date:** {date}
**Status:** {assessment} | **Final Verdict:** {final_verdict}
**Review Method:** Multi-Agent (Opus + Sonnet + Haiku) with Cross-Verification

## Summary
- Overall: {assessment} | Completeness: {done}/{total} subtasks | Coverage: {coverage_percent}%
- Quality: {blocking} blocking · {suggestions} suggestions · {strengths} strengths
- Confidence: {high_count} HIGH · {medium_count} MEDIUM · {low_count} LOW · {disputed_count} DISPUTED
- Ready for PR: {pr_ready}

## Agent Agreement Overview
| Category | Opus | Sonnet | Haiku | Agreement |
|----------|------|--------|-------|-----------|
| Issues Found | {n} | {n} | {n} | {overlap%}% |
| Warnings | {n} | {n} | {n} | {overlap%}% |
| Strengths | {n} | {n} | {n} | {overlap%}% |

## ❌ Issues (Must Fix)
| # | Confidence | Category | Location | Description | Found By | Verified By |
|---|-----------|----------|----------|-------------|----------|-------------|
| 1 | HIGH | [TS] | file.ts:L88 | Uses `any` type | All 3 | — |
| 2 | MEDIUM | [SECURITY] | file.ts:L102 | Missing input validation | Opus, Sonnet | Haiku confirmed |

## ⚠️ Suggestions
| # | Confidence | Category | Location | Description | Found By | Verified By |
|---|-----------|----------|----------|-------------|----------|-------------|
(same table format)

## ✅ Strengths
| # | Confidence | Category | Location | Description | Found By |
|---|-----------|----------|----------|-------------|----------|
(same table format)

## 🔀 Disputed Findings
(Only include if {disputed_count} > 0)

### Dispute 1: {file}:{line} — {category}
- **Opus says:** {opus_perspective}
- **Sonnet says:** {sonnet_perspective}
- **Haiku says:** {haiku_perspective}
- **Recommendation:** {which side is more convincing and why}

## 📋 Issue Verification
### Subtasks: {subtask_verification}
### Acceptance Criteria: {criteria_verification}

## 🧪 Test Coverage
Coverage: {coverage_percent}% ({tested}/{total} files) — {status}
Missing tests: {missing_tests or "All files covered"}
Test quality: {test_quality_summary}

## 🔒 Security: {security_findings}
## ⚡ Performance: {performance_findings}

## 📝 Detailed Findings by Domain
### Architecture: {architecture_findings with confidence}
### Angular: {angular_findings with confidence or "N/A — no Angular changes"}
### TypeScript: {typescript_findings with confidence}
### Firebase: {firebase_findings with confidence or "N/A — no function changes"}

## 📊 Stats
Source:{n} Templates:{n} Styles:{n} | Tests:{n} | Functions:{n} | Commits:{n}
Review Agents: Opus + Sonnet + Haiku | Total Findings: {n} | Cross-Verified: {n}

## Recommendations
Before merge: {high_confidence_blocking_issues or "No blocking issues"}
Investigate disputes: {disputed_findings_summary or "No disputes"}
Nice to have: {medium_confidence_suggestions or "Code meets all standards"}
Follow-up: {technical_debt or "None"}

## 🎯 Next Steps
- [ ] Fix blocking issues (HIGH confidence): {count}
- [ ] Investigate disputed findings: {disputed_count}
- [ ] Add missing tests: {missing_test_count}
- [ ] Review suggestions (MEDIUM+ confidence): {count}
- [ ] Run manual testing checklist

**Generated by:** Claude Code Multi-Agent Review (Opus + Sonnet + Haiku)
```

31. **✅ CHECKPOINT**: All sections present, placeholders resolved → OUTPUT {review_report} to user

32. **SAVE report** — WRITE {review_report} to `reviews/{issue_key}-review-{YYYY-MM-DD}.md` (create `reviews/` directory if it doesn't exist) → OUTPUT "📄 Report saved to reviews/{issue_key}-review-{YYYY-MM-DD}.md"

---

## Phase 11: Interactive Options (Steps 33-34)

33. **PRESENT options:**
    ```
    ✅ Multi-agent review complete! Report saved. Next action?
    1. Create TODO list           2. Show code examples
    3. Generate PR description    4. Review file in detail
    5. Show agent disagreements   6. Show agent perspectives
    7. Exit
    ```
    WAIT → SAVE as {user_choice}

34. **EXECUTE choice:**

    ├─ `1` / "todo" → FORMAT each ❌ as "❌ [{confidence}] [File:Line] {desc}" + each ⚠️ as "⚠️ [{confidence}] [File:Line] {desc}" → LOOP to 33
    ├─ `2` / "examples" → FOR each HIGH/MEDIUM suggestion: READ file section → SHOW current + proposed → LOOP to 33
    ├─ `3` / "pr" → BUILD PR template: Issue/Summary/Changes/Testing/Review Notes (include multi-agent confidence summary) → OUTPUT → LOOP to 33
    ├─ `4` / "detail" → ASK which file → READ → ANALYZE vs standards → LOOP to 33
    ├─ `5` / "disagreements" → LIST all DISPUTED findings with each agent's perspective + reasoning → LOOP to 33
    ├─ `6` / "perspectives" → SHOW side-by-side: what each agent focused on, unique findings per agent, agreement areas → LOOP to 33
    └─ `7` / "exit" → "Review complete. Good luck with your PR!" → END

---

## Error Handling

| Error | Detection | Action |
|---|---|---|
| Not on feature branch | Branch doesn't match pattern | WARN, ASK for issue key manually |
| Issue not found | Jira API 404 | REPORT "not found" → STOP |
| No commits | {commit_count} === 0 | REPORT "no changes to review" → STOP |
| Git command fails | Non-zero exit | REPORT error → SUGGEST manual fix |
| Incomplete subtasks | Status !== "Done" | WARN, ASK to continue |
| Missing acceptance criteria | Not found in description | WARN, use full description |
| Jira API timeout | > 30s | RETRY once → STOP |
| Diff too large (>100K) | Exceeds threshold | TRUNCATE to source + functions, note in report |
| Diff large (>50K) | Exceeds threshold | WARN "agents may take longer" → CONTINUE |
| Unknown file types | No category match | ADD to "Other" → continue |
| Standards file inaccessible | Cannot read rules | WARN "using generic standards" → CONTINUE |
| Agent returns empty | Empty Task response | WARN "agent {name} returned no results" → continue with remaining agents |
| Agent timeout | Task takes >5 min | WARN "agent {name} timed out" → continue with available results |
| Agent output malformed | Cannot parse structured format | WARN "agent {name} output could not be parsed" → show raw output in report addendum |
| All agents fail | All 3 Task calls fail | REPORT "Multi-agent review failed" → fallback: run single-agent review in main thread |
| Cross-verification fails | 1+ cross-verification Tasks fail | Compute confidence with available data (2/3 instead of 3/3) |

---

## Success Criteria

- [ ] Issue details retrieved from Jira
- [ ] All commits and diff analyzed
- [ ] Files categorized correctly
- [ ] Three independent review agents launched in parallel (Opus, Sonnet, Haiku)
- [ ] All three agents returned structured findings
- [ ] Three cross-verification agents launched in parallel
- [ ] Cross-verification completed with CONFIRMED/DISPUTED/NEW verdicts
- [ ] Findings synthesized with confidence levels (HIGH/MEDIUM/LOW/DISPUTED)
- [ ] Acceptance criteria and subtasks verified
- [ ] Final verification pass completed (tests, regressions, scope)
- [ ] Comprehensive report with confidence levels, agent attribution, and file:line references
- [ ] Disputed findings presented with each agent's perspective
- [ ] Assessment (Excellent/Good/Needs Work/Blocking) accurate and justified

---

## Integration Notes

**Run Before:** `/pull-request` · **Run After:** `/pick-subtask` · **Feed Into:** PR description (option 3)

**Standards:** `claude-base.md` (architecture) · `src/CLAUDE.md` (Angular/TypeScript) · `functions/CLAUDE.md` (Firebase) · `tests/CLAUDE.md` (Testing)

**Token Budget:** 6 Task calls total (3 reviews + 3 cross-verifications). Large diffs (>50K) increase token usage significantly.
