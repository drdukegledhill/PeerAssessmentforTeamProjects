#!/usr/bin/env python3
"""
Build unified peer-assessment team config JSON from a roster CSV.

Input CSV (headers, case-insensitive):
- team (or group)
- name (or student)
- email (optional)

Example:
team,name,email
Team Nightmare,Alice Smith,alice@uni.ac.uk
Team Nightmare,Bob Jones,bob@uni.ac.uk
Team Dodgefathers,Charlie Chen,charlie@uni.ac.uk

Usage:
python3 build_teams_config.py \
  --roster roster.csv \
  --module NHE2443 \
  --cohort Final \
  --out teams.json
"""

import argparse
import csv
import json
from collections import OrderedDict


def normalise_headers(row):
    return {k.strip().lower(): v for k, v in row.items()}


def pick(row, keys):
    for key in keys:
        if key in row and str(row[key]).strip():
            return str(row[key]).strip()
    return ""


def load_roster(path):
    teams = OrderedDict()

    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("Roster CSV has no header row")

        for idx, raw in enumerate(reader, start=2):
            row = normalise_headers(raw)

            team = pick(row, ["team", "group", "team_name", "group_name"])
            name = pick(row, ["name", "student", "student_name", "full_name"])
            email = pick(row, ["email", "student_email", "mail"])

            if not team and not name and not email:
                continue

            if not team or not name:
                raise ValueError(
                    f"Row {idx}: each row must include team/group and name/student columns"
                )

            teams.setdefault(team, [])
            teams[team].append({"name": name, "email": email})

    if not teams:
        raise ValueError("No valid roster rows found")

    return teams


def build_config(module, cohort, teams_map):
    return {
        "module": module,
        "cohort": cohort,
        "teams": [
            {"name": team_name, "students": students}
            for team_name, students in teams_map.items()
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Build teams.json from roster CSV")
    parser.add_argument("--roster", required=True, help="Input roster CSV path")
    parser.add_argument("--module", required=True, help="Module code, e.g. NHE2443")
    parser.add_argument("--cohort", required=True, help="Cohort label, e.g. Final")
    parser.add_argument("--out", default="teams.json", help="Output config JSON path")
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON with indentation (default true)",
    )
    args = parser.parse_args()

    teams_map = load_roster(args.roster)
    config = build_config(args.module, args.cohort, teams_map)

    indent = 2 if args.pretty or True else None
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=indent)
        f.write("\n")

    total_students = sum(len(v) for v in teams_map.values())
    print(f"Wrote {args.out}")
    print(f"Teams: {len(teams_map)}")
    print(f"Students: {total_students}")


if __name__ == "__main__":
    main()
