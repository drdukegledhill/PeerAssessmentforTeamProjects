# Peer Assessment for Team Projects

A Python tool for analysing peer assessment data from team projects and generating normalised scores with feedback reports.

## Overview

This tool processes peer assessment CSV files (typically exported from Google Forms) and produces:
- **Normalised scores** (0-9 scale) that centre around a target median of 5
- **Summary tables** with each student's raw and normalised scores
- **Individual feedback** with aggregated peer comments

The tool automatically detects students and adapts to any group size, excluding self-assessments from calculations.

## Features

- ✅ Automatic student detection from CSV headers
- ✅ Self-assessment exclusion
- ✅ Score normalisation to centre group mean around target (default: 5)
- ✅ Summary table with raw and normalised scores
- ✅ Individual feedback sections with peer comments
- ✅ Works with any group size

## Requirements

- Python 3.6+
- No external dependencies (uses only standard library)

## Usage

```bash
python3 pa_report.py <csv_file>
```

### Example

```bash
python3 pa_report.py "NHE2443_PA_Concept (Responses) - Dungeoneers.csv"
```

## CSV Format

The tool expects a CSV file with the following column patterns:

| Column Type | Expected Header Pattern |
|-------------|------------------------|
| Respondent name | Contains "select your name" or "your name" |
| Overall contribution | `Please rate [the] overall contribution from [Student Name]` |
| Justification/Comments | Column immediately following the overall contribution column |

### Getting CSV Data from Google Forms

1. **Create a Google Form** for peer assessment with questions for each team member
2. **Link responses to a Google Sheet**: In Google Forms, go to the "Responses" tab and click the green Sheets icon to create a linked spreadsheet
3. **Export as CSV**: In Google Sheets, go to `File` → `Download` → `Comma Separated Values (.csv)`
4. **Run the report**: Use the downloaded CSV file with this tool

### Sample CSV Structure

The CSV should be exported from a peer assessment form where each student rates all team members on their overall contribution (1-9 scale) and provides justification comments.

## Output

The tool generates a report with:

1. **Header Information**
   - Total number of students
   - Raw group mean score
   - Normalisation adjustment applied
   
2. **Summary Table**
   - List of all students (in original order)
   - Raw average scores
   - Normalised final scores (0-9)

3. **Individual Feedback**
   - Each student's final score
   - Aggregated peer comments

## Normalisation

Scores are normalised so that the group mean centres around 5:
- Raw scores are adjusted by `(target - group_mean)`
- Final scores are rounded and clamped to the 0-9 range
- This ensures fair comparison across different teams with varying rating tendencies

## Licence

This work is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

You are free to:
- **Share** — copy and redistribute the material in any medium or format
- **Adapt** — remix, transform, and build upon the material

Under the following terms:
- **Attribution** — You must give appropriate credit, provide a link to the licence, and indicate if changes were made.
- **NonCommercial** — You may not use the material for commercial purposes.
- **ShareAlike** — If you remix, transform, or build upon the material, you must distribute your contributions under the same licence.

## Author

Dr Duke Gledhill - University of Huddersfield
