#!/usr/bin/env python3
"""
GDPR-safe peer assessment form system (self-hosted, scriptable).

What this provides:
- Scriptable survey generation from a JSON team config
- Pseudonym-based web forms (no student names exposed in the form UI)
- Local SQLite storage for submissions
- CSV export compatible with pa_report.py

Usage:
  python3 gdpr_form_system.py init --config teams.json --db peer_forms.db
  python3 gdpr_form_system.py run --db peer_forms.db --host 127.0.0.1 --port 8080
  python3 gdpr_form_system.py export --db peer_forms.db --outdir exports --decode-names
"""

import argparse
import csv
import datetime as dt
import json
import os
import secrets
import sqlite3
from html import escape
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS teams (
  team_id TEXT PRIMARY KEY,
  module_code TEXT,
  cohort TEXT,
  team_name TEXT
);

CREATE TABLE IF NOT EXISTS members (
  team_id TEXT,
  alias TEXT,
  real_name TEXT,
  ordinal INTEGER,
  PRIMARY KEY (team_id, alias),
  FOREIGN KEY (team_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS links (
  team_id TEXT PRIMARY KEY,
  token TEXT UNIQUE,
  FOREIGN KEY (team_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT,
  rater_alias TEXT,
  submitted_at TEXT,
  payload_json TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(team_id)
);
"""


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


def connect_db(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema(conn):
    conn.executescript(SCHEMA_SQL)
    conn.commit()


def load_config(config_path):
    with open(config_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    required = ["module", "cohort", "teams"]
    for key in required:
        if key not in payload:
            raise ValueError(f"Missing required config key: {key}")
    if not isinstance(payload["teams"], list) or not payload["teams"]:
        raise ValueError("config.teams must be a non-empty list")

    # Normalise students so both scripts can share one config format.
    # Supported student entries:
    # - "Alice Smith"
    # - {"name": "Alice Smith", "email": "alice@uni.ac.uk"}
    for team in payload["teams"]:
        team_name = team.get("name", "")
        students = team.get("students", [])
        if not isinstance(students, list):
            raise ValueError(f"students must be a list for team: {team_name}")

        norm_students = []
        for item in students:
            if isinstance(item, str):
                norm_students.append(item)
            elif isinstance(item, dict) and item.get("name"):
                norm_students.append(str(item["name"]).strip())
            else:
                raise ValueError(
                    f"Invalid student entry in team '{team_name}'. Use string or object with a 'name' field."
                )

        team["students"] = norm_students

    return payload


def assign_aliases(students):
    # Stable simple aliases: M01, M02, ...
    return [(f"M{idx:02d}", name) for idx, name in enumerate(students, start=1)]


def cmd_init(args):
    cfg = load_config(args.config)
    conn = connect_db(args.db)
    ensure_schema(conn)

    module_code = cfg["module"]
    cohort = cfg["cohort"]

    for idx, team in enumerate(cfg["teams"], start=1):
        team_name = team["name"]
        students = team["students"]
        if not students:
            continue

        team_id = f"{slugify(team_name)}-{idx}"
        conn.execute(
            "INSERT OR REPLACE INTO teams(team_id,module_code,cohort,team_name) VALUES(?,?,?,?)",
            (team_id, module_code, cohort, team_name),
        )
        conn.execute("DELETE FROM members WHERE team_id = ?", (team_id,))
        conn.execute("DELETE FROM links WHERE team_id = ?", (team_id,))

        aliases = assign_aliases(students)
        for ord_idx, (alias, real_name) in enumerate(aliases, start=1):
            conn.execute(
                "INSERT INTO members(team_id,alias,real_name,ordinal) VALUES(?,?,?,?)",
                (team_id, alias, real_name, ord_idx),
            )

        token = secrets.token_urlsafe(10)
        conn.execute("INSERT INTO links(team_id,token) VALUES(?,?)", (team_id, token))

    conn.commit()

    rows = conn.execute(
        """
        SELECT t.team_name, l.token
        FROM teams t
        JOIN links l ON l.team_id = t.team_id
        ORDER BY t.team_name
        """
    ).fetchall()

    print("Created/updated survey links:")
    for row in rows:
        url = f"http://{args.host}:{args.port}/survey/{row['token']}"
        print(f"- {row['team_name']}: {url}")

    # Export local admin mapping (keep private)
    mapping_path = Path(args.mapping)
    mapping_path.parent.mkdir(parents=True, exist_ok=True)
    with open(mapping_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["team_name", "alias", "real_name"])
        map_rows = conn.execute(
            """
            SELECT t.team_name, m.alias, m.real_name
            FROM members m
            JOIN teams t ON t.team_id = m.team_id
            ORDER BY t.team_name, m.ordinal
            """
        ).fetchall()
        for r in map_rows:
            writer.writerow([r["team_name"], r["alias"], r["real_name"]])

    print(f"\nPrivate alias mapping written to: {mapping_path}")
    conn.close()


def _team_by_token(conn, token):
    row = conn.execute(
        """
        SELECT t.team_id, t.team_name, t.module_code, t.cohort
        FROM links l
        JOIN teams t ON t.team_id = l.team_id
        WHERE l.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def _members(conn, team_id):
    return conn.execute(
        "SELECT alias, real_name, ordinal FROM members WHERE team_id = ? ORDER BY ordinal",
        (team_id,),
    ).fetchall()


def _html_form(team, members):
    aliases = [m["alias"] for m in members]
    options = "".join([f"<option value='{escape(a)}'>{escape(a)}</option>" for a in aliases])

    cards = []
    for alias in aliases:
        block = f"""
        <fieldset class='card' data-target='{escape(alias)}'>
          <legend>Rate teammate {escape(alias)}</legend>
          <label>Engagement (0-9)
            <input type='number' min='0' max='9' name='engagement__{escape(alias)}' required>
          </label>
          <label>Communication (0-9)
            <input type='number' min='0' max='9' name='communication__{escape(alias)}' required>
          </label>
          <label>Overall contribution (0-9)
            <input type='number' min='0' max='9' name='overall__{escape(alias)}' required>
          </label>
          <label>Quantity of contribution (1-5)
            <input type='number' min='1' max='5' name='quantity__{escape(alias)}' required>
          </label>
          <label>Quality of contribution (1-5)
            <input type='number' min='1' max='5' name='quality__{escape(alias)}' required>
          </label>
          <label>Optional justification
            <textarea name='justification__{escape(alias)}' rows='3'></textarea>
          </label>
        </fieldset>
        """
        cards.append(block)

    cards_html = "\n".join(cards)

    return f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Peer Assessment - {escape(team['team_name'])}</title>
<style>
:root {{ --bg:#f3f5f7; --ink:#1f2933; --card:#ffffff; --line:#d7dde3; --accent:#0d6d4d; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:var(--bg); color:var(--ink); margin:0; }}
main {{ max-width: 860px; margin: 0 auto; padding: 1.2rem; }}
header {{ background:linear-gradient(120deg,#0d6d4d,#1e8f68); color:white; padding:1.25rem; border-radius:10px; }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:0.9rem; margin:0.85rem 0; }}
label {{ display:block; margin:0.5rem 0; font-size:0.95rem; }}
input, select, textarea {{ width:100%; margin-top:0.25rem; padding:0.45rem; border:1px solid var(--line); border-radius:6px; box-sizing:border-box; }}
button {{ background:var(--accent); color:white; border:none; border-radius:8px; padding:0.7rem 1rem; font-weight:700; cursor:pointer; }}
.small {{ font-size:0.9rem; color:#44515e; }}
</style>
<script>
function onRaterChange() {{
  const rater = document.getElementById('rater_alias').value;
  document.querySelectorAll('fieldset[data-target]').forEach(fs => {{
    const target = fs.getAttribute('data-target');
    fs.style.display = (target === rater) ? 'none' : 'block';
  }});
}}
window.addEventListener('DOMContentLoaded', onRaterChange);
</script>
</head>
<body>
<main>
  <header>
    <h1>Peer Assessment</h1>
    <p class='small'>Module {escape(team['module_code'])}, {escape(team['cohort'])} | Team {escape(team['team_name'])}</p>
    <p class='small'>This form uses aliases only. No student names are shown on this page.</p>
  </header>

  <form method='post' action=''>
    <div class='card'>
      <label>Your alias
        <select id='rater_alias' name='rater_alias' onchange='onRaterChange()' required>
          {options}
        </select>
      </label>
      <p class='small'>Rate each teammate once. Your own row is hidden automatically.</p>
    </div>

    {cards_html}

    <button type='submit'>Submit assessment</button>
  </form>
</main>
</body>
</html>
"""


def _thank_you(team_name):
    return f"""<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Submitted</title></head>
<body style='font-family:system-ui;padding:2rem;background:#f5f7f9;'>
<h1>Submitted</h1>
<p>Your peer assessment for <strong>{escape(team_name)}</strong> has been recorded.</p>
</body></html>"""


class SurveyHandler(BaseHTTPRequestHandler):
    db_path = None

    def _conn(self):
        return connect_db(self.db_path)

    def _send_html(self, html, status=HTTPStatus.OK):
        payload = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.split("/") if p]

        if not parts:
            self._send_html("<h1>Peer Assessment Server</h1><p>Use your survey link.</p>")
            return

        if len(parts) == 2 and parts[0] == "survey":
            token = parts[1]
            conn = self._conn()
            team = _team_by_token(conn, token)
            if not team:
                self._send_html("<h1>Not found</h1>", status=HTTPStatus.NOT_FOUND)
                conn.close()
                return
            members = _members(conn, team["team_id"])
            html = _html_form(team, members)
            conn.close()
            self._send_html(html)
            return

        self._send_html("<h1>Not found</h1>", status=HTTPStatus.NOT_FOUND)

    def do_POST(self):
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.split("/") if p]

        if len(parts) == 2 and parts[0] == "survey":
            token = parts[1]
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            form = parse_qs(body, keep_blank_values=True)

            conn = self._conn()
            team = _team_by_token(conn, token)
            if not team:
                self._send_html("<h1>Not found</h1>", status=HTTPStatus.NOT_FOUND)
                conn.close()
                return

            members = _members(conn, team["team_id"])
            aliases = [m["alias"] for m in members]
            rater_alias = (form.get("rater_alias") or [""])[0].strip()

            if rater_alias not in aliases:
                self._send_html("<h1>Invalid alias</h1>", status=HTTPStatus.BAD_REQUEST)
                conn.close()
                return

            payload = {}
            for alias in aliases:
                record = {
                    "engagement": (form.get(f"engagement__{alias}") or [""])[0],
                    "communication": (form.get(f"communication__{alias}") or [""])[0],
                    "overall": (form.get(f"overall__{alias}") or [""])[0],
                    "quantity": (form.get(f"quantity__{alias}") or [""])[0],
                    "quality": (form.get(f"quality__{alias}") or [""])[0],
                    "justification": (form.get(f"justification__{alias}") or [""])[0].strip(),
                }
                payload[alias] = record

            conn.execute(
                "INSERT INTO submissions(team_id,rater_alias,submitted_at,payload_json) VALUES(?,?,?,?)",
                (
                    team["team_id"],
                    rater_alias,
                    dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    json.dumps(payload, ensure_ascii=True),
                ),
            )
            conn.commit()
            conn.close()
            self._send_html(_thank_you(team["team_name"]))
            return

        self._send_html("<h1>Not found</h1>", status=HTTPStatus.NOT_FOUND)


def cmd_run(args):
    conn = connect_db(args.db)
    ensure_schema(conn)
    conn.close()

    SurveyHandler.db_path = args.db
    server = ThreadingHTTPServer((args.host, args.port), SurveyHandler)
    print(f"Serving surveys on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        server.server_close()


def name_for(alias, member_rows, decode_names):
    if not decode_names:
        return alias
    for m in member_rows:
        if m["alias"] == alias:
            return m["real_name"]
    return alias


def cmd_export(args):
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    conn = connect_db(args.db)
    teams = conn.execute("SELECT team_id, team_name FROM teams ORDER BY team_name").fetchall()

    for team in teams:
        members = _members(conn, team["team_id"])
        aliases = [m["alias"] for m in members]

        headers = ["Select your name"]
        for alias in aliases:
            display = name_for(alias, members, args.decode_names)
            headers.extend([
                f"Please rate the overall contribution from {display}",
                f"Justify your rating for {display}",
                f"Please rate {display} level of engagement",
                f"Please rate {display} communication skills",
                f"Please rate quantity of contribution from {display}",
                f"Please rate quality of contribution from {display}",
            ])

        rows = conn.execute(
            "SELECT rater_alias, payload_json FROM submissions WHERE team_id = ? ORDER BY id",
            (team["team_id"],),
        ).fetchall()

        out_path = outdir / f"{slugify(team['team_name'])}.csv"
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)

            for row in rows:
                payload = json.loads(row["payload_json"])
                rater = name_for(row["rater_alias"], members, args.decode_names)
                out = [rater]

                for alias in aliases:
                    rec = payload.get(alias, {})
                    out.extend([
                        rec.get("overall", ""),
                        rec.get("justification", ""),
                        rec.get("engagement", ""),
                        rec.get("communication", ""),
                        rec.get("quantity", ""),
                        rec.get("quality", ""),
                    ])
                writer.writerow(out)

        print(f"Exported {out_path}")

    conn.close()


def build_parser():
    p = argparse.ArgumentParser(description="GDPR-safe peer assessment form system")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_init = sub.add_parser("init", help="Create/update surveys from team config")
    p_init.add_argument("--config", required=True, help="Path to team config JSON")
    p_init.add_argument("--db", default="peer_forms.db", help="SQLite DB path")
    p_init.add_argument("--host", default="127.0.0.1", help="Host used for printed links")
    p_init.add_argument("--port", default=8080, type=int, help="Port used for printed links")
    p_init.add_argument("--mapping", default="alias_mapping.csv", help="Private alias mapping CSV output")
    p_init.set_defaults(func=cmd_init)

    p_run = sub.add_parser("run", help="Run local survey web server")
    p_run.add_argument("--db", default="peer_forms.db", help="SQLite DB path")
    p_run.add_argument("--host", default="127.0.0.1", help="Server bind host")
    p_run.add_argument("--port", default=8080, type=int, help="Server bind port")
    p_run.set_defaults(func=cmd_run)

    p_export = sub.add_parser("export", help="Export submissions to pa_report-compatible CSV")
    p_export.add_argument("--db", default="peer_forms.db", help="SQLite DB path")
    p_export.add_argument("--outdir", default="exports", help="CSV output directory")
    p_export.add_argument("--decode-names", action="store_true", help="Export real names instead of aliases")
    p_export.set_defaults(func=cmd_export)

    return p


def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
