#!/usr/bin/env python3
"""
Peer Assessment Report Generator

Analyses peer assessment CSV files and generates normalised scores with feedback.
Automatically detects students and adjusts to any group size.

Usage: python3 pa_report.py <csv_file>
"""

# Import required standard library modules
import csv      # For reading CSV files
import sys      # For command-line arguments and exit codes
import re       # For regular expression pattern matching
from collections import defaultdict  # For creating dictionaries with default values


def parse_csv(filepath):
    """
    Read CSV file and return headers and data rows.
    
    Args:
        filepath: Path to the CSV file to read
        
    Returns:
        Tuple of (headers list, data rows list)
    """
    # Open file with UTF-8 encoding to handle special characters
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        # Convert the CSV reader to a list so we can separate headers from data
        rows = list(reader)
    # Return first row as headers, remaining rows as data
    return rows[0], rows[1:]


def extract_students_and_columns(headers):
    """
    Parse headers to find all students and their column indices.
    Looks for pattern: "Please rate X overall contribution" to identify students.
    
    Args:
        headers: List of column header strings from the CSV
        
    Returns:
        Tuple of (students dict mapping names to column indices, name_col index)
    """
    students = {}
    
    # Create regex pattern to match "Please rate [the] overall contribution from [Name]"
    # The (?:the )? makes "the " optional (non-capturing group)
    # (.+) captures the student name
    overall_pattern = re.compile(r"Please rate (?:the )?overall contribution from (.+)", re.IGNORECASE)
    
    # Iterate through all headers to find student contribution columns
    for i, header in enumerate(headers):
        match = overall_pattern.search(header)
        if match:
            # Extract the student name from the regex capture group
            name = match.group(1).strip()
            # Store column indices for this student's scores and comments
            # The CSV structure has: overall score column, then justification column
            students[name] = {
                'overall': i,           # Column index for overall contribution score
                'justification': i + 1,  # Justification/comment column follows immediately
            }
    
    # Find the column where respondents identify themselves
    # This is needed to exclude self-assessments from calculations
    name_col = None
    for i, header in enumerate(headers):
        # Look for common variations of "select your name" headers
        if 'select your name' in header.lower() or 'your name' in header.lower():
            name_col = i
            break  # Stop once we find the name column
    
    return students, name_col


def calculate_scores(data, students, name_col):
    """
    Calculate raw averages for each student (excluding self-assessment).
    
    Args:
        data: List of data rows from the CSV
        students: Dict mapping student names to their column indices
        name_col: Column index where respondent identifies themselves
        
    Returns:
        Tuple of (raw_avgs dict, all_scores list)
    """
    raw_avgs = {}       # Will store each student's average score
    all_scores = []     # Collects all scores for group statistics
    non_attendees = set()  # Students who received all-zero scores from every peer

    # Process each student to calculate their average peer rating
    for student, cols in students.items():
        scores = []  # Scores received by this student

        # Go through each response row
        for row in data:
            # Identify who submitted this response
            rater = row[name_col] if name_col is not None else None

            # Skip if this is a self-assessment (student rating themselves)
            if rater == student:
                continue

            try:
                # Extract the numeric score from the appropriate column
                score = int(row[cols['overall']])
                scores.append(score)
                all_scores.append(score)  # Also add to overall scores list
            except (ValueError, IndexError):
                # Skip if score is missing or not a valid number
                pass

        # Calculate average: sum divided by count, or 0 if no scores
        raw_avgs[student] = sum(scores) / len(scores) if scores else 0

        # Flag students who received all-zero scores from every peer rater.
        # These are excluded from normalisation so they don't distort group stats.
        if scores and all(s == 0 for s in scores):
            non_attendees.add(student)

    return raw_avgs, all_scores, non_attendees


def normalize_scores(raw_avgs, all_scores, target=5, non_attendees=None):
    """
    Normalise scores using both median and mean as the group reference.
    Non-attendees (all-zero scores) are excluded from both reference calculations.

    Args:
        raw_avgs: Dict of raw average scores per student
        all_scores: List of all individual scores (unused, kept for compatibility)
        target: Target value to centre the group around (default: 5)
        non_attendees: Set of student names to exclude from the reference calculation

    Returns:
        Tuple of (normalised_median dict, normalised_mean dict,
                  group_median, median_adjustment, group_mean, mean_adjustment)
    """
    if non_attendees is None:
        non_attendees = set()

    if not raw_avgs:
        return {}, {}, 0, 0, 0, 0

    attendee_avgs = [v for k, v in raw_avgs.items() if k not in non_attendees]
    if not attendee_avgs:
        empty = {k: 0 for k in raw_avgs}
        return empty, empty, 0, 0, 0, 0

    sorted_avgs = sorted(attendee_avgs)
    group_median = sorted_avgs[len(sorted_avgs) // 2]
    median_adjustment = target - group_median

    group_mean = sum(attendee_avgs) / len(attendee_avgs)
    mean_adjustment = target - group_mean

    normalised_median = {}
    normalised_mean = {}
    for student, raw in raw_avgs.items():
        if student in non_attendees:
            normalised_median[student] = 0
            normalised_mean[student] = 0
        else:
            med_score = max(0, min(9, round(raw + median_adjustment)))
            mean_score = max(0, min(9, round(raw + mean_adjustment)))
            normalised_median[student] = med_score
            normalised_mean[student] = mean_score

    return normalised_median, normalised_mean, group_median, median_adjustment, group_mean, mean_adjustment


def extract_comments(data, students, name_col):
    """
    Extract peer comments for each student (excluding self-assessment).
    
    Args:
        data: List of data rows from the CSV
        students: Dict mapping student names to their column indices
        name_col: Column index where respondent identifies themselves
        
    Returns:
        Dict mapping student names to list of their received comments
    """
    # defaultdict(list) creates empty list automatically for new keys
    comments = defaultdict(list)
    
    # Process each student to collect their feedback comments
    for student, cols in students.items():
        for row in data:
            # Identify who submitted this response
            rater = row[name_col] if name_col is not None else None
            
            # Skip self-assessment comments
            if rater == student:
                continue
                
            try:
                # Get the comment from the justification column
                comment = row[cols['justification']].strip()
                # Only add non-empty comments
                if comment:
                    comments[student].append(comment)
            except IndexError:
                # Skip if column doesn't exist in this row
                pass
    
    return comments


def generate_report(students, raw_avgs, normalised_median, normalised_mean, comments,
                    group_median, median_adjustment, group_mean, mean_adjustment,
                    non_attendees=None, title="PEER ASSESSMENT REPORT"):
    """
    Generate and print the full peer assessment report.

    Args:
        students: Dict of student names and their column indices
        raw_avgs: Dict of raw average scores per student
        normalised_median: Dict of median-normalised final scores per student
        normalised_mean: Dict of mean-normalised final scores per student
        comments: Dict mapping students to their received comments
        group_median: The group median of raw averages used for normalisation
        median_adjustment: The median-based normalisation adjustment applied
        group_mean: The group mean of raw averages used for normalisation
        mean_adjustment: The mean-based normalisation adjustment applied
        non_attendees: Set of student names flagged as did-not-attend
        title: Title for the report header
    """
    if non_attendees is None:
        non_attendees = set()

    student_list = list(students.keys())

    print("=" * 80)
    print(title)
    print("=" * 80)
    print()

    # Summary statistics - show both reference points side by side
    print(f"Total students: {len(students)}")
    print(f"{'':30}{'Median-based':>16}{'Mean-based':>16}")
    print(f"{'Group reference (raw):':<30}{group_median:>16.2f}{group_mean:>16.2f}")
    print(f"{'Normalisation adjustment:':<30}{median_adjustment:>+16.2f}{mean_adjustment:>+16.2f}")
    print(f"{'Target:':<30}{'5':>16}{'5':>16}")
    print()

    # Summary table
    print("-" * 80)
    print("SUMMARY TABLE")
    print("-" * 80)
    print(f"{'#':<6}{'Student':<30}{'Raw Avg':>12}{'Median Score':>16}{'Mean Score':>16}")
    print("-" * 80)

    for num, student in enumerate(student_list, 1):
        med_display = "DNA" if student in non_attendees else str(normalised_median[student])
        mean_display = "DNA" if student in non_attendees else str(normalised_mean[student])
        print(f"{num:<6}{student:<30}{raw_avgs[student]:>12.2f}{med_display:>16}{mean_display:>16}")

    print("-" * 80)

    # Group stats for normalised scores (excluding non-attendees)
    att_med = [v for k, v in normalised_median.items() if k not in non_attendees]
    att_mean = [v for k, v in normalised_mean.items() if k not in non_attendees]
    grp_mean_med = sum(att_med) / len(att_med) if att_med else 0
    grp_mean_mean = sum(att_mean) / len(att_mean) if att_mean else 0
    sorted_med = sorted(att_med)
    sorted_mean = sorted(att_mean)
    grp_med_med = sorted_med[len(sorted_med) // 2] if sorted_med else 0
    grp_med_mean = sorted_mean[len(sorted_mean) // 2] if sorted_mean else 0

    print(f"{'Normalised group mean:':<46}{grp_mean_med:>16.2f}{grp_mean_mean:>16.2f}")
    print(f"{'Normalised group median:':<46}{grp_med_med:>16}{grp_med_mean:>16}")
    print()

    # Individual feedback
    print("=" * 80)
    print("INDIVIDUAL FEEDBACK")
    print("=" * 80)

    for student in student_list:
        print()
        print(f">>> {student}")
        if student in non_attendees:
            print(f"    Score: 0 (Did not attend - excluded from group normalisation)")
        else:
            print(f"    Median score: {normalised_median[student]}   |   Mean score: {normalised_mean[student]}")
        print()

        if comments[student]:
            print("    Peer Comments:")
            for comment in comments[student]:
                print(f"    - {comment}")
        else:
            print("    Peer Comments: (No comments provided)")
        print()
        print("-" * 80)


def main():
    """
    Main entry point for the peer assessment report generator.
    Handles command-line arguments and orchestrates the report generation.
    """
    # Check if a CSV file path was provided as command-line argument
    if len(sys.argv) < 2:
        # Print usage instructions if no file specified
        print("Usage: python3 pa_report.py <csv_file>")
        print()
        print("Example: python3 pa_report.py responses.csv")
        sys.exit(1)  # Exit with error code 1
    
    # Get the file path from command-line arguments
    filepath = sys.argv[1]
    
    # Attempt to read and parse the CSV file
    try:
        headers, data = parse_csv(filepath)
    except FileNotFoundError:
        print(f"Error: File '{filepath}' not found.")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)
    
    # Extract student names and their column positions from the CSV headers
    students, name_col = extract_students_and_columns(headers)
    
    # Validate that we found students in the file
    if not students:
        print("Error: Could not find any students in the CSV file.")
        print("Expected columns like 'Please rate the overall contribution from [Name]'")
        sys.exit(1)
    
    # Warn if we couldn't find the respondent name column
    if name_col is None:
        print("Warning: Could not find respondent name column. Self-assessments won't be excluded.")
    
    # Display detected students for verification
    print(f"Detected {len(students)} students: {', '.join(students.keys())}")
    print()
    
    # Step 1: Calculate raw average scores for each student
    raw_avgs, all_scores, non_attendees = calculate_scores(data, students, name_col)

    if non_attendees:
        print(f"Non-attendees detected (excluded from normalisation): {', '.join(non_attendees)}")
        print()

    # Step 2: Normalise scores using both median and mean as reference
    normalised_median, normalised_mean, group_median, median_adjustment, group_mean, mean_adjustment = \
        normalize_scores(raw_avgs, all_scores, non_attendees=non_attendees)

    # Step 3: Extract peer feedback comments
    comments = extract_comments(data, students, name_col)

    # Step 4: Generate and print the final report
    generate_report(students, raw_avgs, normalised_median, normalised_mean, comments,
                    group_median, median_adjustment, group_mean, mean_adjustment,
                    non_attendees=non_attendees)


# Standard Python idiom: only run main() if this script is executed directly
# (not when imported as a module)
if __name__ == "__main__":
    main()
