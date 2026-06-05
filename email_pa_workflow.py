#!/usr/bin/env python3
"""
Email-based peer assessment workflow for Outlook-only environments.

Goal
- No web form platform required
- No external mailbox API required
- Scales to large cohorts by parsing Outlook-exported .eml files
- Outputs CSV files compatible with docs/ browser tool

Commands
1) Generate outbound email templates:
   python3 email_pa_workflow.py generate --config teams.json --outdir email_templates

2) Parse Outlook-exported replies (.eml) and build per-team CSVs:
   python3 email_pa_workflow.py parse --config teams.json --emails-dir replies_eml --outdir exports

Parse mode also writes operations outputs for large cohorts:
- submission_dashboard.csv: expected vs submitted vs missing per team
- missing_students.csv: one row per missing student
- parse_issues.csv: malformed/unmatched responses

Team config schema (JSON):
{
  "module": "NHE2443",
  "cohort": "Final",
  "teams": [
    {
      "name": "Team A",
      "students": [
        {"name": "Alice Smith", "email": "alice@uni.ac.uk"},
        {"name": "Bob Jones", "email": "bob@uni.ac.uk"}
      ]
    }
  ]
}
"""

import argparse
import csv
import json
import re
from collections import defaultdict
from email import policy
from email.parser import BytesParser
from pathlib import Path

BEGIN_MARKER = "PA-RESPONSE-BEGIN"
END_MARKER = "PA-RESPONSE-END"


def slugify(value):
    out = []
    for ch in value.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_"):
            out.append("-")
    slug = "".join(out).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "team"


def norm_name(name):
    return re.sub(r"\s+", " ", str(name).strip()).casefold()


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    if "module" not in cfg or "cohort" not in cfg or "teams" not in cfg:
        raise ValueError("Config must contain module, cohort, and teams")

    teams = []
    for team in cfg["teams"]:
        t_name = team["name"]
        students = []
        for item in team["students"]:
            if isinstance(item, str):
                students.append({"name": item, "email": ""})
            else:
                students.append({"name": item["name"], "email": item.get("email", "")})
        teams.append({"name": t_name, "students": students})

    return {"module": cfg["module"], "cohort": cfg["cohort"], "teams": teams}


def build_subject(module_code, team_name, rater_name):
    return f"[PA|{module_code}|{team_name}|{rater_name}] Peer Assessment Response"


def build_body(module_code, cohort, team_name, rater_name, teammates):
    lines = []
    lines.append("Please complete this template and reply, keeping the subject unchanged.")
    lines.append("Use one line per teammate in CSV format:")
    lines.append("Name,Overall(0-9),Engagement(0-9),Communication(0-9),Quantity(1-5),Quality(1-5),Justification")
    lines.append("")
    lines.append(BEGIN_MARKER)
    lines.append(f"MODULE,{module_code}")
    lines.append(f"COHORT,{cohort}")
    lines.append(f"TEAM,{team_name}")
    lines.append(f"RATER,{rater_name}")
    for mate in teammates:
        lines.append(f"{mate},,,,,,")
    lines.append(END_MARKER)
    lines.append("")
    lines.append("Important: do not change names in the first column.")
    return "\n".join(lines)


def cmd_generate(args):
    cfg = load_config(args.config)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    mailmerge_rows = [["To", "Subject", "Body", "Team", "Rater"]]

    for team in cfg["teams"]:
        team_name = team["name"]
        students = team["students"]
        t_dir = outdir / slugify(team_name)
        t_dir.mkdir(parents=True, exist_ok=True)

        for s in students:
            rater = s["name"]
            teammates = [x["name"] for x in students if x["name"] != rater]
            subject = build_subject(cfg["module"], team_name, rater)
            body = build_body(cfg["module"], cfg["cohort"], team_name, rater, teammates)

            fname = f"{slugify(rater)}.txt"
            with open(t_dir / fname, "w", encoding="utf-8") as f:
                f.write(f"To: {s.get('email','')}\n")
                f.write(f"Subject: {subject}\n\n")
                f.write(body)

            mailmerge_rows.append([s.get("email", ""), subject, body, team_name, rater])

    with open(outdir / "outlook_mailmerge.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerows(mailmerge_rows)

    print(f"Templates written to {outdir}")
    print(f"Mail merge CSV: {outdir / 'outlook_mailmerge.csv'}")


def extract_text_from_eml(path):
    with open(path, "rb") as f:
        msg = BytesParser(policy=policy.default).parse(f)

    # Prefer plain text part
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    return str(part.get_content())
                except Exception:
                    pass
    try:
        return str(msg.get_body(preferencelist=("plain",)).get_content())
    except Exception:
        pass

    payload = msg.get_payload(decode=True)
    if payload is None:
        return ""
    return payload.decode(errors="ignore")


def extract_between_markers(text):
    b = text.find(BEGIN_MARKER)
    e = text.find(END_MARKER)
    if b == -1 or e == -1 or e <= b:
        return None
    return text[b + len(BEGIN_MARKER):e].strip()


def parse_response_block(block):
    lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    meta = {}
    ratings = []

    for ln in lines:
        parts = [p.strip() for p in ln.split(",")]
        if not parts:
            continue

        key = parts[0].upper()
        if key in {"MODULE", "COHORT", "TEAM", "RATER"}:
            meta[key] = parts[1] if len(parts) > 1 else ""
            continue

        # Rating row: Name,Overall,Engagement,Communication,Quantity,Quality,Justification
        name = parts[0]
        overall = parts[1] if len(parts) > 1 else ""
        engagement = parts[2] if len(parts) > 2 else ""
        communication = parts[3] if len(parts) > 3 else ""
        quantity = parts[4] if len(parts) > 4 else ""
        quality = parts[5] if len(parts) > 5 else ""
        justification = ",".join(parts[6:]).strip() if len(parts) > 6 else ""

        ratings.append(
            {
                "name": name,
                "overall": overall,
                "engagement": engagement,
                "communication": communication,
                "quantity": quantity,
                "quality": quality,
                "justification": justification,
            }
        )

    return meta, ratings


def to_int_or_blank(value):
    s = str(value).strip()
    if not s:
        return ""
    try:
        return int(s)
    except ValueError:
        return ""


def index_config(cfg):
    by_team = {}
    for t in cfg["teams"]:
        members = [s["name"] for s in t["students"]]
        by_team[norm_name(t["name"])] = {"team": t, "members": members}
    return by_team


def cmd_parse(args):
    cfg = load_config(args.config)
    by_team = index_config(cfg)

    emails_dir = Path(args.emails_dir)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    if not emails_dir.exists():
        raise FileNotFoundError(f"Emails folder not found: {emails_dir}")

    collected = defaultdict(list)
    bad_files = []
    file_index = 0

    files = sorted(list(emails_dir.glob("*.eml")) + list(emails_dir.glob("*.txt")))
    for file in files:
        try:
            file_index += 1
            if file.suffix.lower() == ".eml":
                text = extract_text_from_eml(file)
            else:
                text = file.read_text(encoding="utf-8", errors="ignore")

            block = extract_between_markers(text)
            if not block:
                bad_files.append((file.name, "Markers not found"))
                continue

            meta, ratings = parse_response_block(block)
            team_name = meta.get("TEAM", "")
            rater_name = meta.get("RATER", "")

            key = norm_name(team_name)
            if key not in by_team:
                bad_files.append((file.name, f"Unknown team: {team_name}"))
                continue

            expected_members = by_team[key]["members"]
            member_lookup = {norm_name(m): m for m in expected_members}

            if norm_name(rater_name) not in member_lookup:
                bad_files.append((file.name, f"Unknown rater: {rater_name}"))
                continue

            team_key = by_team[key]["team"]["name"]

            row_map = {}
            for r in ratings:
                nm = member_lookup.get(norm_name(r["name"]))
                if not nm:
                    continue
                row_map[nm] = {
                    "overall": to_int_or_blank(r["overall"]),
                    "engagement": to_int_or_blank(r["engagement"]),
                    "communication": to_int_or_blank(r["communication"]),
                    "quantity": to_int_or_blank(r["quantity"]),
                    "quality": to_int_or_blank(r["quality"]),
                    "justification": r["justification"].strip(),
                }

            collected[team_key].append(
                {
                    "rater": member_lookup[norm_name(rater_name)],
                    "ratings": row_map,
                    "source": file.name,
                    "order": file_index,
                }
            )
        except Exception as exc:
            bad_files.append((file.name, f"Parse error: {exc}"))

    # Resolve duplicates per team/rater unless caller explicitly keeps all.
    resolved = {}
    dedupe_dropped = 0
    for team_name, entries in collected.items():
        if args.allow_duplicates:
            resolved[team_name] = entries
            continue

        by_rater = defaultdict(list)
        for entry in entries:
            by_rater[norm_name(entry["rater"])].append(entry)

        team_rows = []
        for r_entries in by_rater.values():
            r_entries = sorted(r_entries, key=lambda x: x["order"])
            chosen = r_entries[0] if args.dedupe_strategy == "first" else r_entries[-1]
            team_rows.append(chosen)
            dedupe_dropped += max(0, len(r_entries) - 1)

        resolved[team_name] = sorted(team_rows, key=lambda x: x["order"])

    # Write one CSV per team in browser-tool-compatible shape.
    written = []
    for team_name, entries in resolved.items():
        team_info = by_team[norm_name(team_name)]
        members = team_info["members"]

        headers = ["Select your name"]
        for m in members:
            headers.extend(
                [
                    f"Please rate overall contribution from {m}",
                    f"Justify your rating for {m}",
                    f"Please rate {m} level of engagement",
                    f"Please rate {m} communication skills",
                    f"Please rate quantity of contribution from {m}",
                    f"Please rate quality of contribution from {m}",
                ]
            )

        out_path = outdir / f"{slugify(team_name)}.csv"
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(headers)
            for entry in entries:
                row = [entry["rater"]]
                for m in members:
                    rr = entry["ratings"].get(m, {})
                    row.extend(
                        [
                            rr.get("overall", ""),
                            rr.get("justification", ""),
                            rr.get("engagement", ""),
                            rr.get("communication", ""),
                            rr.get("quantity", ""),
                            rr.get("quality", ""),
                        ]
                    )
                w.writerow(row)
        written.append(out_path)

    # Completion dashboard for operational tracking.
    dash_rows = [[
        "team",
        "expected_students",
        "submitted_unique",
        "missing_count",
        "missing_students",
        "rows_exported",
    ]]
    missing_rows = [["team", "student"]]

    for team in cfg["teams"]:
        team_name = team["name"]
        members = [s["name"] for s in team["students"]]
        expected_lookup = {norm_name(m): m for m in members}

        team_entries = resolved.get(team_name, [])
        submitted_key_set = {norm_name(e["rater"]) for e in team_entries}
        submitted_names = [expected_lookup[k] for k in sorted(submitted_key_set) if k in expected_lookup]
        missing = [m for m in members if norm_name(m) not in submitted_key_set]

        for student in missing:
            missing_rows.append([team_name, student])

        dash_rows.append([
            team_name,
            len(members),
            len(submitted_names),
            len(missing),
            " | ".join(missing),
            len(team_entries),
        ])

    dashboard_path = outdir / "submission_dashboard.csv"
    with open(dashboard_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerows(dash_rows)

    missing_path = outdir / "missing_students.csv"
    with open(missing_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerows(missing_rows)

    print(f"Parsed files: {len(files)}")
    print(f"Team CSV exports: {len(written)}")
    if args.allow_duplicates:
        print("Duplicate responses retained (--allow-duplicates)")
    else:
        print(f"Duplicate responses dropped by dedupe: {dedupe_dropped} (strategy={args.dedupe_strategy})")
    for p in written:
        print(f"- {p}")
    print(f"- {dashboard_path}")
    print(f"- {missing_path}")

    if bad_files:
        bad_log = outdir / "parse_issues.csv"
        with open(bad_log, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["file", "issue"])
            w.writerows(bad_files)
        print(f"\nIssues logged to: {bad_log}")


def build_parser():
    p = argparse.ArgumentParser(description="Outlook email workflow for peer assessment")
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate", help="Generate email templates and mail merge CSV")
    g.add_argument("--config", required=True, help="Team config JSON")
    g.add_argument("--outdir", default="email_templates", help="Output directory")
    g.set_defaults(func=cmd_generate)

    pr = sub.add_parser("parse", help="Parse Outlook-exported replies into per-team CSVs")
    pr.add_argument("--config", required=True, help="Team config JSON")
    pr.add_argument("--emails-dir", required=True, help="Directory containing .eml/.txt replies")
    pr.add_argument("--outdir", default="exports", help="Output directory for per-team CSVs")
    pr.add_argument("--allow-duplicates", action="store_true", help="Keep duplicate responses per rater")
    pr.add_argument(
        "--dedupe-strategy",
        choices=["first", "latest"],
        default="latest",
        help="When duplicates exist and --allow-duplicates is not set, choose which response to keep",
    )
    pr.set_defaults(func=cmd_parse)

    return p


def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
