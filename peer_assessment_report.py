#!/usr/bin/env python3
"""
Peer Assessment Report Generator

Analyzes peer assessment CSV files and generates normalized scores with feedback.
Automatically detects students and adjusts to any group size.

Usage: python3 peer_assessment_report.py <csv_file>
"""

import csv
import sys
import re
from collections import defaultdict


def parse_csv(filepath):
    """Read CSV file and return headers and data rows."""
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)
    return rows[0], rows[1:]


def extract_students_and_columns(headers):
    """
    Parse headers to find all students and their column indices.
    Looks for pattern: "Please rate X overall contribution" to identify students.
    Returns dict mapping student names to their column indices.
    """
    students = {}
    
    # Find columns for "overall contribution" to identify students
    overall_pattern = re.compile(r"Please rate (?:the )?overall contribution from (.+)", re.IGNORECASE)
    
    for i, header in enumerate(headers):
        match = overall_pattern.search(header)
        if match:
            name = match.group(1).strip()
            # The columns are: engagement, communication, overall, justification, quantity, quality
            # Overall is at offset 2, so engagement starts at i-2
            students[name] = {
                'overall': i,
                'justification': i + 1,  # Justification comes after overall
            }
    
    # Find the "name" column (where respondent identifies themselves)
    name_col = None
    for i, header in enumerate(headers):
        if 'select your name' in header.lower() or 'your name' in header.lower():
            name_col = i
            break
    
    return students, name_col


def calculate_scores(data, students, name_col):
    """
    Calculate raw averages for each student (excluding self-assessment).
    Returns raw averages and all individual scores.
    """
    raw_avgs = {}
    all_scores = []
    
    for student, cols in students.items():
        scores = []
        for row in data:
            rater = row[name_col] if name_col is not None else None
            if rater == student:  # Skip self-assessment
                continue
            try:
                score = int(row[cols['overall']])
                scores.append(score)
                all_scores.append(score)
            except (ValueError, IndexError):
                pass
        raw_avgs[student] = sum(scores) / len(scores) if scores else 0
    
    return raw_avgs, all_scores


def normalize_scores(raw_avgs, all_scores, target=5):
    """
    Normalize scores so group mean centers around target.
    Returns normalized integer scores.
    """
    if not all_scores:
        return {}, 0, 0
    
    group_mean = sum(all_scores) / len(all_scores)
    adjustment = target - group_mean
    
    normalized = {}
    for student, raw in raw_avgs.items():
        norm_score = raw + adjustment
        norm_score = round(norm_score)
        norm_score = max(0, min(9, norm_score))  # Clamp to 0-9
        normalized[student] = norm_score
    
    return normalized, group_mean, adjustment


def extract_comments(data, students, name_col):
    """
    Extract peer comments for each student (excluding self-assessment).
    Returns dict mapping student names to list of comments.
    """
    comments = defaultdict(list)
    
    for student, cols in students.items():
        for row in data:
            rater = row[name_col] if name_col is not None else None
            if rater == student:  # Skip self-assessment
                continue
            try:
                comment = row[cols['justification']].strip()
                if comment:
                    comments[student].append(comment)
            except IndexError:
                pass
    
    return comments


def generate_report(students, raw_avgs, normalized, comments, group_mean, adjustment, title="PEER ASSESSMENT REPORT"):
    """Generate and print the full report."""
    
    # Sort students by normalized score (descending)
    sorted_students = sorted(students.keys(), key=lambda s: normalized.get(s, 0), reverse=True)
    
    print("=" * 70)
    print(title)
    print("=" * 70)
    print()
    print(f"Total students: {len(students)}")
    print(f"Group mean (raw): {group_mean:.2f}")
    print(f"Normalization adjustment: {adjustment:+.2f}")
    print(f"Target median: 5")
    print()
    
    # Summary table
    print("-" * 70)
    print("SUMMARY TABLE")
    print("-" * 70)
    print(f"{'Rank':<6}{'Student':<30}{'Raw Avg':>12}{'Score':>12}")
    print("-" * 70)
    
    for rank, student in enumerate(sorted_students, 1):
        print(f"{rank:<6}{student:<30}{raw_avgs[student]:>12.2f}{normalized[student]:>12}")
    
    print("-" * 70)
    
    # Group statistics
    int_mean = sum(normalized.values()) / len(normalized) if normalized else 0
    sorted_vals = sorted(normalized.values())
    median = sorted_vals[len(sorted_vals) // 2] if sorted_vals else 0
    
    print(f"{'':36}{'Group Mean:':>12}{int_mean:>12.2f}")
    print(f"{'':36}{'Median:':>12}{median:>12}")
    print()
    
    # Individual feedback
    print("=" * 70)
    print("INDIVIDUAL FEEDBACK")
    print("=" * 70)
    
    for student in sorted_students:
        print()
        print(f">>> {student}")
        print(f"    Score: {normalized[student]}")
        print()
        if comments[student]:
            print("    Peer Comments:")
            print("    " + " | ".join(comments[student]))
        else:
            print("    Peer Comments: (No comments provided)")
        print()
        print("-" * 70)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 peer_assessment_report.py <csv_file>")
        print()
        print("Example: python3 peer_assessment_report.py responses.csv")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    try:
        headers, data = parse_csv(filepath)
    except FileNotFoundError:
        print(f"Error: File '{filepath}' not found.")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)
    
    # Extract students and their columns
    students, name_col = extract_students_and_columns(headers)
    
    if not students:
        print("Error: Could not find any students in the CSV file.")
        print("Expected columns like 'Please rate the overall contribution from [Name]'")
        sys.exit(1)
    
    if name_col is None:
        print("Warning: Could not find respondent name column. Self-assessments won't be excluded.")
    
    print(f"Detected {len(students)} students: {', '.join(students.keys())}")
    print()
    
    # Calculate scores
    raw_avgs, all_scores = calculate_scores(data, students, name_col)
    
    # Normalize
    normalized, group_mean, adjustment = normalize_scores(raw_avgs, all_scores)
    
    # Extract comments
    comments = extract_comments(data, students, name_col)
    
    # Generate report
    generate_report(students, raw_avgs, normalized, comments, group_mean, adjustment)


if __name__ == "__main__":
    main()
