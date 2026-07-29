# Scoring sign-off — Phase 3B.6

Status: **PENDING BUSINESS SIGN-OFF**. This document records current code; it does not approve the formula.

## Current calculation contract

- `ACTUAL_DIV_TARGET`: `actual / target * 100`; target zero is not scorable.
- `TARGET_DIV_ACTUAL`: `target / actual * 100`; target or actual zero is not scorable.
- `BINARY`: actual `0` gives `0`; actual `1` gives `100`; other values are invalid.
- Achievement percentage uses integer HALF_UP: `87.4 → 87`, `87.5 → 88`.
- **Open assumption:** `rawWorkScore = rawAchievementPercentage`. This is implemented for backward compatibility but is not business-approved.
- Work score uses HALF_UP to a multiple of 10: `84 → 80`, `85 → 90`, `94 → 90`, `95 → 100`.
- Weighted score: `roundedWorkScore * weight / 100`.
- A complete BSC requires at least one KPI, total weight exactly 100, and every KPI scorable.

## Classification boundaries

| Final score | Grade |
|---:|:---|
| `< 70` | D |
| `70 ≤ score < 80` | C |
| `80 ≤ score < 90` | B |
| `90 ≤ score ≤ 100` | A |
| `score > 100` | A+ |

Boundary evidence must include: `69.99, 70, 79.99, 80, 89.99, 90, 100, 100.01, 111`; zero divisors; values over 100%; incomplete weight; all three calculation methods; adjustment limits if/when adjustment is enabled.

Transition policy: records approved before deployment keep their persisted grade and snapshots. Legacy `A++` remains reportable but cannot be assigned to a new evaluation. Any preview or approval calculated after deployment uses the new scale, including a reopened BSC.

## Mandatory business examples

| Case | Input | Current expected result | Business decision |
|---|---|---|---|
| Higher is better | target 100, actual 87.5, weight 20 | achievement 88, work score 90, weighted 18 | Pending |
| Lower is better | target 80, actual 100, weight 30 | achievement 80, work score 80, weighted 24 | Pending |
| Binary pass | actual 1, weight 10 | achievement/work 100, weighted 10 | Pending |
| Binary fail | actual 0, weight 10 | achievement/work 0, weighted 0 | Pending |
| Over-achievement | target 100, actual 111, weight 40 | work score 110, weighted 44 | Pending |
| Invalid denominator | target 0 or lower-is-better actual 0 | not scorable | Pending |

## Signatures

| Signer | Title | Date | Decision/status | Notes |
|---|---|---|---|---|
|  |  |  |  |  |

Until signed, pilot use is limited to workflow/UAT validation. Scores must not be used for payroll, compensation, or formal performance decisions.
