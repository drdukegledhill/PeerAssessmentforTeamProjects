# Peer Assessment for Team Projects

A tool for analysing peer assessment data from team projects and generating normalised scores with individual feedback reports. Available as a browser-based web tool and a Python command-line script.

## Web Version

The easiest way to use this tool is via the hosted web version - no installation required.

**[https://drdukegledhill.github.io/PeerAssessmentforTeamProjects/](https://drdukegledhill.github.io/PeerAssessmentforTeamProjects/)**

Upload your CSV file and the report generates instantly in your browser. Your data never leaves your device.

## Overview

The tool processes peer assessment CSV files (exported from Google Forms or Microsoft Forms) and produces:

- **Normalised scores** (0–9 scale) centred around a target median of 5
- **Summary tables** with each student's raw average and normalised score
- **Individual feedback** with aggregated peer comments
- **Did Not Attend (DNA)** detection: students who receive all zeros from every peer rater are flagged and excluded from the normalisation reference

Students are detected automatically from column headers. Self-assessments are excluded from all calculations. The tool adapts to any group size.

## Setting Up Your Form

### Google Forms

1. **Dropdown question**: "Select your name" - add all team member names as options.
2. For **each team member**, add two questions:
   - **Linear scale (1–9)**: "Please rate overall contribution from [Name]"
   - **Short answer**: A justification question, e.g. "Justify your rating for [Name]"
3. Link responses to a Google Sheet: in Google Forms, go to the **Responses** tab and click the Sheets icon.
4. Export: in Google Sheets go to **File → Download → Comma Separated Values (.csv)**.

### Microsoft Forms

1. **Choice question**: "Select your name" - add all team member names as options (one answer, dropdown).
2. For **each team member**, add two questions:
   - **Choice question** with options 1, 2, 3 … 9: "Please rate overall contribution from [Name]" (one answer, dropdown)
   - **Text question**: A justification question, e.g. "Justify your rating for [Name]"
3. Share the form and collect responses.
4. Export: go to the **Responses** tab → **Open in Excel**, then in Excel go to **File → Save As → CSV UTF-8 (.csv)**.

> **Tip:** Use a Choice question (not Rating) for 1–9 scores in Microsoft Forms - this ensures values export as plain numbers. In either platform, the justification question text doesn't matter; the tool uses the column immediately after each "overall contribution" column.

## CSV Format

| Column type | Expected header pattern |
|-------------|------------------------|
| Respondent name | Contains "select your name" or "your name" |
| Overall contribution | `Please rate [the] overall contribution from [Student Name]` |
| Justification/Comments | Column immediately following the overall contribution column |

### Example CSV (3 students)

```csv
Select your name,Please rate overall contribution from Alice,Justify Alice,Please rate overall contribution from Bob,Justify Bob,Please rate overall contribution from Charlie,Justify Charlie
Alice,7,Self assessment,8,Great teamwork,6,Could communicate more
Bob,7,Very organised,5,Self assessment,7,Reliable
Charlie,8,Led the project well,7,Helpful,6,Self assessment
```

### Example Output

```
Detected 3 students: Alice, Bob, Charlie

======================================================================
PEER ASSESSMENT REPORT
======================================================================

Total students: 3
Group median (raw): 7.50
Normalisation adjustment: -2.50
Target: 5

----------------------------------------------------------------------
SUMMARY TABLE
----------------------------------------------------------------------
#     Student                          Raw Avg       Score
----------------------------------------------------------------------
1     Alice                               7.50           5
2     Bob                                 7.50           5
3     Charlie                             6.50           4
----------------------------------------------------------------------
                                    Group Mean:        4.67
                                       Median:           5

======================================================================
INDIVIDUAL FEEDBACK
======================================================================

>>> Alice
    Score: 5

    Peer Comments:
    - Very organised
    - Led the project well

----------------------------------------------------------------------

>>> Bob
    Score: 5

    Peer Comments:
    - Great teamwork
    - Helpful

----------------------------------------------------------------------

>>> Charlie
    Score: 4

    Peer Comments:
    - Could communicate more
    - Reliable

----------------------------------------------------------------------
```

## Python CLI

A command-line version is available for batch processing or scripted workflows. It produces identical output to the web tool.

**Requirements:** Python 3.6+, no external dependencies.

```bash
python3 pa_report.py "team1.csv"
```

## Normalisation

Scores are normalised so the group centres on 5, enabling fair comparison across teams with different rating tendencies:

1. All peer scores are collected, excluding self-assessments.
2. Each student's raw average is calculated from the scores they received.
3. Any student who received **all zeros** from every peer rater is flagged as **Did not attend (DNA)** and excluded from the normalisation reference. Their score is recorded as 0.
4. The **median** of the remaining students' raw averages is used as the group reference point. The median is used rather than the mean so that one very low-scoring student does not distort everyone else's scores.
5. An adjustment is applied: `normalised = raw average + (5 − group median)`
6. Results are rounded using **banker's rounding** (round half to even) and clamped to the 0–9 range.

## Pedagogical Rationale

### What the system actually measures

This tool does not ask students to grade peers in the way a lecturer grades an essay. It asks them to rank relative contribution within their team. The scale from 1 to 9 has no fixed external meaning - a "6" does not mean "this person did 60% of the work." What matters is how the ratings relate to each other: giving Alice a 7 and Bob a 5 says Alice contributed roughly 40% more than Bob, relative to the team.

Because the numbers have no fixed external meaning, the system cannot simply use them as-is.

### Why normalisation is necessary

Imagine two teams sitting the same group project:

- **Team A** rates generously - they give each other 7s and 8s because everyone worked hard and they feel positive about it.
- **Team B** rates harshly - they give 4s and 5s because they hold each other to a high standard.

Without normalisation, a student in Team A would receive a much higher score than an equally contributing student in Team B - not because they did more work, but because their teammates were kinder with the scale. Normalisation adjusts each team's scores so they centre on the same reference point (5), making scores comparable across teams with different rating cultures.

### Common student concerns

**"I gave someone a 6 and they ended up with a 4 - why?"**

Multiple peers rated that person, and their raw average across all peer ratings was calculated (excluding self-assessment). If they received a 6 from one rater but lower scores from others, their raw average was pulled down by those other ratings. And if the team's median was above 5 - because the team rated generously overall - the adjustment brought scores down further. Each individual rating is one honest data point; the result reflects what the group collectively observed, corrected for the team's rating tendencies.

**"I gave someone a 2 and they ended up with a 0 - why?"**

A rating of 2 on a 1 to 9 scale is a very low relative assessment - it signals serious concern about contribution. When the group median is above 5, the downward adjustment can push a raw average of 2 below zero, which is clamped to 0. The system is not inventing a punishment; it is faithfully reflecting that this student was rated very poorly relative to the team norm.

**"What if we all agree to give everyone a 6 or 7?"**

If every student gives every other student a 7, every student's raw average is 7, the group median is 7, and the adjustment is 5 - 7 = -2. Every student's final score is 7 - 2 = 5. Everyone ends up with 5. The inflation cancels out completely.

This is not a bug - it is a core feature. The system is resistant to collusion. Inflating ratings does not help anyone; it only tells the assessor that the team felt uncomfortable differentiating. The pedagogical purpose of peer assessment is to give students a voice in recognising differential contribution within a team. Surrendering that voice by agreeing on uniform scores defeats the purpose entirely.

### Why median rather than mean as the reference point

The median is used rather than the arithmetic mean because it is robust to outliers. If one student did not engage and received very low scores from everyone, using the mean would pull the reference point down and inflate every other student's score. The median focuses on the typical student in the group and ignores the extremes, protecting well-contributing students from being distorted by a non-contributor at one end of the distribution.

> The key question to ask when rating: compared to what an average member of this team contributed, did this person contribute more, the same, or less? A score of 5 means average for the team. The numbers only matter relative to each other - not in absolute terms.

## Licence

This work is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

You are free to:
- **Share**: copy and redistribute the material in any medium or format
- **Adapt**: remix, transform, and build upon the material

Under the following terms:
- **Attribution**: you must give appropriate credit, provide a link to the licence, and indicate if changes were made.
- **NonCommercial**: you may not use the material for commercial purposes.
- **ShareAlike**: if you remix, transform, or build upon the material, you must distribute your contributions under the same licence.

## Author

Dr Duke Gledhill, University of Huddersfield
