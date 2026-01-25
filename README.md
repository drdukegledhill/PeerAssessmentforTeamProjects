# Peer Assessment for Team Projects

A Python tool for analyzing peer assessment data from team projects and generating normalized scores with feedback reports.

## Overview

This tool processes peer assessment CSV files (typically exported from Google Forms) and produces:
- **Normalized scores** (0-9 scale) that center around a target median of 5
- **Summary tables** ranking students by their peer-assessed contribution
- **Individual feedback** with aggregated peer comments

The tool automatically detects students and adapts to any group size, excluding self-assessments from calculations.

## Features

- ✅ Automatic student detection from CSV headers
- ✅ Self-assessment exclusion
- ✅ Score normalization to center group mean around target (default: 5)
- ✅ Ranked summary table with raw and normalized scores
- ✅ Individual feedback sections with peer comments
- ✅ Works with any group size

## Requirements

- Python 3.6+
- No external dependencies (uses only standard library)

## Usage

```bash
python3 peer_assessment_report.py <csv_file>
```

### Example

```bash
python3 peer_assessment_report.py "NHE2443_PA_Concept (Responses) - Dungeoneers.csv"
```

## CSV Format

The tool expects a CSV file with the following column patterns:

| Column Type | Expected Header Pattern |
|-------------|------------------------|
| Respondent name | Contains "select your name" or "your name" |
| Overall contribution | `Please rate [the] overall contribution from [Student Name]` |
| Justification/Comments | Column immediately following the overall contribution column |

### Sample CSV Structure

The CSV should be exported from a peer assessment form where each student rates all team members on their overall contribution (1-9 scale) and provides justification comments.

## Output

The tool generates a report with:

1. **Header Information**
   - Total number of students
   - Raw group mean score
   - Normalization adjustment applied
   
2. **Summary Table**
   - Ranked list of all students
   - Raw average scores
   - Normalized final scores (0-9)

3. **Individual Feedback**
   - Each student's final score
   - Aggregated peer comments

## Normalization

Scores are normalized so that the group mean centers around 5:
- Raw scores are adjusted by `(target - group_mean)`
- Final scores are rounded and clamped to the 0-9 range
- This ensures fair comparison across different teams with varying rating tendencies

## License

MIT License

## Author

Dr Duke Gledhill - University of Huddersfield
