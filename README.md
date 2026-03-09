# Peer Assessment for Team Projects

A tool for analysing peer assessment data from team projects and generating normalised scores with individual feedback reports. Available as a browser-based web tool and a Python command-line script.

## Web Version

The easiest way to use this tool is via the hosted web version - no installation required.

**[https://drdukegledhill.github.io/PeerAssessmentforTeamProjects/](https://drdukegledhill.github.io/PeerAssessmentforTeamProjects/)**

Upload your CSV file and the report generates instantly in your browser. Your data never leaves your device.

A companion **[Normalisation Simulator](https://drdukegledhill.github.io/PeerAssessmentforTeamProjects/simulator.html)** is also available for students to experiment with ratings interactively and see how normalisation responds in real time.

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
Group median (raw):           7.50
Normalisation adjustment:    -2.50
Target:                       5

----------------------------------------------------------------------
SUMMARY TABLE
----------------------------------------------------------------------
#     Student                          Raw Avg     Score
----------------------------------------------------------------------
1     Alice                               7.50         5
2     Bob                                 7.50         5
3     Charlie                             6.50         4
----------------------------------------------------------------------
Group mean (normalised):                          4.67
Group median (normalised):                           5

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

This tool does not ask students to grade peers in the way a lecturer grades an essay. It asks them to rank relative contribution within their team (Conway et al., 1993; Falchikov & Goldfinch, 2000) - a valid pedagogical approach when students have worked closely enough to observe each other's contributions (Boud et al., 1999). The scale from 1 to 9 has no fixed external meaning - a "6" does not mean "this person did 60% of the work." What matters is how the ratings relate to each other: giving Alice a 7 and Bob a 5 says Alice contributed roughly 40% more than Bob, relative to the team.

Because the numbers have no fixed external meaning, the system cannot simply use them as-is. The peer comments students provide alongside their ratings are not an afterthought - giving structured feedback on a colleague's contribution is itself a learning activity (Liu & Carless, 2006).

> Conway, R., Kember, D., Sivan, A., & Wu, M. (1993). Peer assessment of an individual's contribution to a group project. *Assessment & Evaluation in Higher Education, 18*(1), 45–56. https://hdl.handle.net/102.100.100/560694 - Directly supports the relative contribution model: peer ratings as rankings within a team rather than absolute grades.
>
> Falchikov, N., & Goldfinch, J. (2000). Student peer assessment in higher education: A meta-analysis comparing peer and teacher marks. *Review of Educational Research, 70*(3), 287–322. https://doi.org/10.3102/00346543070003287 - Meta-analytic evidence for the validity and reliability of peer contribution ratings.
>
> Boud, D., Cohen, R., & Sampson, J. (1999). Peer learning and assessment. *Assessment & Evaluation in Higher Education, 24*(4), 413–426. https://doi.org/10.1080/0260293990240405 - Foundational conditions under which peer assessment is pedagogically valid in team project contexts.
>
> Liu, N.-F., & Carless, D. (2006). Peer feedback: The learning element of peer assessment. *Teaching in Higher Education, 11*(3), 279–290. https://doi.org/10.1080/13562510600680582 - Supports the pedagogical value of the individual qualitative feedback output generated for each student.

### Why normalisation is necessary

Imagine two teams sitting the same group project:

- **Team A** rates generously - they give each other 7s and 8s because everyone worked hard and they feel positive about it.
- **Team B** rates harshly - they give 4s and 5s because they hold each other to a high standard.

Without normalisation, a student in Team A would receive a much higher score than an equally contributing student in Team B - not because they did more work, but because their teammates were kinder with the scale. Normalisation adjusts each team's scores so they centre on the same reference point (5), making scores comparable across teams with different rating cultures (Cheng & Warren, 2000; Lejk & Wyvill, 2001).

> Cheng, W., & Warren, M. (2000). Making a difference: Using peers to assess individual students' contributions to a group project. *Teaching in Higher Education, 5*(2), 243–255. https://doi.org/10.1080/135625100114885 - Addresses the comparability problem across groups with different rating cultures and the case for normalisation.
>
> Lejk, M., & Wyvill, M. (2001). The effect of the inclusion of self-assessment with peer assessment of contributions to a group project: A quantitative study of secret and agreed assessments. *Assessment & Evaluation in Higher Education, 26*(6), 551–561. https://www.tandfonline.com/doi/abs/10.1080/02602930120093887 - Examines how group rating tendencies affect scores and the rationale for adjustment mechanisms.

### Common student concerns

**"I gave someone a 6 and they ended up with a 4 - why?"**

Multiple peers rated that person, and their raw average across all peer ratings was calculated (excluding self-assessment; Sluijsmans et al., 1999; Topping, 1998). If they received a 6 from one rater but lower scores from others, their raw average was pulled down by those other ratings. And if the team's median was above 5 - because the team rated generously overall - the adjustment brought scores down further. Each individual rating is one honest data point; the result reflects what the group collectively observed, corrected for the team's rating tendencies.

> Sluijsmans, D., Dochy, F., & Moerkerke, G. (1999). Creating a learning environment by using self-, peer-, and co-assessment. *Learning Environments Research, 1*(3), 293–319. https://link.springer.com/article/10.1023/A:1009932704458 - Distinguishes self-assessment from peer assessment and provides methodological justification for excluding self-ratings from calculations.
>
> Topping, K. (1998). Peer assessment between students in colleges and universities. *Review of Educational Research, 68*(3), 249–276. https://doi.org/10.3102/00346543068003249 - Widely cited review recommending self-assessments be treated separately from peer ratings due to self-serving bias.

**"I gave someone a 2 and they ended up with a 0 - why?"**

A rating of 2 on a 1 to 9 scale is a very low relative assessment - it signals serious concern about contribution. When the group median is above 5, the downward adjustment can push a raw average of 2 below zero, which is clamped to 0. This is a direct consequence of the normalisation formula: the same group-level adjustment that protects well-contributing students from generous rating cultures will push already very low scores further down (Lejk & Wyvill, 2001). The system is not inventing a punishment; it is faithfully reflecting that this student was rated very poorly relative to the team norm.

> Lejk, M., & Wyvill, M. (2001). The effect of the inclusion of self-assessment with peer assessment of contributions to a group project: A quantitative study of secret and agreed assessments. *Assessment & Evaluation in Higher Education, 26*(6), 551–561. https://www.tandfonline.com/doi/abs/10.1080/02602930120093887 - Examines how group-level normalisation adjustments affect individual scores across the distribution, including for low-scoring students.

**"What if we all agree to give everyone a 6 or 7?"**

If every student gives every other student a 7, every student's raw average is 7, the group median is 7, and the adjustment is 5 - 7 = -2. Every student's final score is 7 - 2 = 5. Everyone ends up with 5. The inflation cancels out completely.

This is not a bug - it is a core feature. The system is resistant to collusion. Inflating ratings does not help anyone; it only tells the assessor that the team felt uncomfortable differentiating. The pedagogical purpose of peer assessment is to give students a voice in recognising differential contribution within a team (Brooks & Ammons, 2003; Falchikov, 1995). Surrendering that voice by agreeing on uniform scores defeats the purpose entirely.

> Brooks, C. M., & Ammons, J. L. (2003). Free riding and the lessons of classroom experience. *Journal of Education for Business, 78*(4), 217–220. https://www.tandfonline.com/doi/abs/10.1080/08832320309598613 - Supports the necessity of differentiated peer assessment to surface free-rider problems in group work.
>
> Falchikov, N. (1995). Peer feedback marking: Developing peer assessment. *Innovations in Education and Training International, 32*(2), 175–187. https://doi.org/10.1080/1355800950320212 - Addresses student collusion strategies (uniform scoring) and the requirement for system design to be robust to them.

**"One person gave me a really low score - doesn't that drag my average down unfairly?"**

Your raw average is calculated across all peer ratings you received. With a typical group of four or five students, one extreme score has limited influence. If three peers rate you at 7 and one rates you at 2, your raw average is 5.75 - noticeably lower than if that rater had given 6, but not catastrophic. Aggregating multiple independent peer ratings is precisely what makes the system more reliable than any single judgement (Falchikov & Goldfinch, 2000). The more raters there are, the more resilient the system is to any single outlier. If you believe a rating was submitted maliciously rather than honestly, that is a matter to raise directly with your lecturer - but the system does not remove outliers automatically, because doing so would itself create opportunities for gaming (for example, a group agreeing to all rate one person low in order to trigger removal).

> Falchikov, N., & Goldfinch, J. (2000). Student peer assessment in higher education: A meta-analysis comparing peer and teacher marks. *Review of Educational Research, 70*(3), 287–322. https://doi.org/10.3102/00346543070003287 - Meta-analytic evidence that aggregated peer ratings are substantially more reliable than individual peer judgements, and that reliability increases with the number of raters.

**"I was ill and missed a session - will I be flagged as DNA?"**

The DNA (Did Not Attend) flag is only triggered when every single peer rater gives you a score of 0. Missing one session, being less visible at certain points, or receiving a low score from some but not all peers will not trigger the flag. In practice, DNA only occurs when a student was absent for the entire assessed period and all their teammates reflect that unanimously in their ratings.

**"My score is below 5 - does that mean I'm a weak student?"**

Not at all. The peer score measures your contribution *relative to your team*, not your academic ability in any absolute sense. A score of 5 means you contributed at roughly the average level for your group. A score of 4 means your peers observed you contributing slightly less than the team norm - but that is a statement about this project, with this group, during this period. It says nothing about your capability as a student.

Consider what the score is actually attached to. If your team produces a strong piece of work that earns a good mark, a peer score of 4 still places you in the context of that strong work - you are a slightly below-average contributor to an above-average outcome. A score below 5 in a high-performing team can represent genuinely solid academic work; it simply means your teammates were observed contributing a little more during this particular project. Treat the score as one piece of specific, contextual feedback about how your contribution was perceived within this team - not as a verdict on you as a student.

**"I got sixes and positive comments - so why did I end up with a four?"**

This is the most important thing to understand about how this system works: **your peers did give you a six. That is what they thought of you. The four is not what they said.**

The four is the result of a calculation that happened after your peers submitted their ratings. Look at the report: next to your final score you will see a raw average - that is the unfiltered number your peers gave you, before the system touched it. If that number is 6, your peers rated you positively. The normalisation adjustment then shifts all scores in your team by the same amount to re-centre the group around 5. If your team's median was 7, every score moves down by 2 - yours included. Your 6 becomes a 4 not because anyone changed their mind, but because the whole team was rated generously and the adjustment applies equally to everyone.

Here is the part students often miss: **a large downward adjustment is a sign of a strong, positive team.** It means your peers thought highly of each other. If the report shows an adjustment of -2 or -3, your team's raw median was 7 or 8 - your teammates were giving each other genuinely good ratings. The system has levelled that down to make it comparable with other teams, but the underlying signal - that your peers rated you at 6, in a team where everyone was rated highly - is still there in the report. Read the raw average and the comments. Those are what your peers actually said about you. The final score tells you where that sits relative to your team; it does not replace the positive feedback your peers gave.

If, on the other hand, your raw average itself is low - if your peers genuinely gave you 4s and 5s, not 6s and 7s - that is a different conversation, and one worth having with your lecturer rather than dismissing.

### Why median rather than mean as the reference point

The median is used rather than the arithmetic mean because it is robust to outliers (Goldfinch & Raeside, 1990; Lejk et al., 1996). If one student did not engage and received very low scores from everyone, using the mean would pull the reference point down and inflate every other student's score. The median focuses on the typical student in the group and ignores the extremes, protecting well-contributing students from being distorted by a non-contributor at one end of the distribution.

> Goldfinch, J., & Raeside, R. (1990). Development of a peer assessment technique for obtaining individual marks on a group project. *Assessment & Evaluation in Higher Education, 15*(3), 210–231. https://doi.org/10.1080/0260293900150304 - Early treatment of statistical distortion caused by non-contributors on group averages; supports robust scoring design.
>
> Lejk, M., Wyvill, M., & Farrow, S. (1996). A survey of methods of deriving individual grades from group assessments. *Assessment & Evaluation in Higher Education, 21*(3), 267–280. https://doi.org/10.1080/0260293960210307 - Compares methods for deriving individual scores from group ratings; supports the choice of median over mean as outlier-robust.

### Why scores sometimes round unexpectedly - banker's rounding

Final scores are rounded using banker's rounding (round half to even) rather than the familiar "always round 0.5 up" rule. Under standard rounding, 4.5 rounds to 5 and 5.5 rounds to 6 - but so does 6.5, 7.5, and so on, introducing a small but consistent upward bias across a dataset. Banker's rounding instead rounds half-values to the nearest even integer: 4.5 rounds to 4, 5.5 rounds to 6, 6.5 rounds to 6, 7.5 rounds to 8. Over many scores, upward and downward roundings balance out, and no student benefits systematically from where their score happens to land relative to a 0.5 boundary. This is the default rounding mode in IEEE floating-point arithmetic (IEEE, 2008) and is recommended for its statistical neutrality across large datasets (Knuth, 1997).

> IEEE. (2008). *IEEE standard for floating-point arithmetic* (IEEE Std 754-2008). IEEE. https://doi.org/10.1109/IEEESTD.2008.4610935 - The technical standard that defines round-to-nearest-even (banker's rounding) as the default rounding mode for floating-point operations, on the grounds that it avoids systematic bias over repeated rounding.
>
> Knuth, D. E. (1997). *The art of computer programming, Vol. 2: Seminumerical algorithms* (3rd ed.). Addison-Wesley. - Section 4.2.2 analyses rounding modes and demonstrates that round-to-even minimises cumulative rounding error across large sets of numerical values.

**The key question to ask when rating:** compared to what an average member of this team contributed, did this person contribute more, the same, or less? A score of 5 means average for the team. The numbers only matter relative to each other - not in absolute terms.

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
