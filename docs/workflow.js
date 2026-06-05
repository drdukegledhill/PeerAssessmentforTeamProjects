"use strict";

const BEGIN_MARKER = "PA-RESPONSE-BEGIN";
const END_MARKER = "PA-RESPONSE-END";

const teamsJsonFileEl = document.getElementById("teamsJsonFile");
const emailPreambleEl = document.getElementById("emailPreamble");
const emailPostambleEl = document.getElementById("emailPostamble");
const previewMetaEl = document.getElementById("previewMeta");
const emailPreviewEl = document.getElementById("emailPreview");
const downloadEmailZipBtnEl = document.getElementById("downloadEmailZipBtn");
const phase1MetaEl = document.getElementById("phase1Meta");

const replyFilesEl = document.getElementById("replyFiles");
const dedupeStrategyEl = document.getElementById("dedupeStrategy");
const parseRepliesBtnEl = document.getElementById("parseRepliesBtn");
const downloadCsvZipBtnEl = document.getElementById("downloadCsvZipBtn");
const phase2MetaEl = document.getElementById("phase2Meta");
const issuesBoxEl = document.getElementById("issuesBox");
const phase2StatsEl = document.getElementById("phase2Stats");

const step1StatusEl = document.getElementById("step1Status");
const step2StatusEl = document.getElementById("step2Status");
const step3StatusEl = document.getElementById("step3Status");

const statFilesProcessedEl = document.getElementById("statFilesProcessed");
const statValidRepliesEl = document.getElementById("statValidReplies");
const statDuplicatesDroppedEl = document.getElementById("statDuplicatesDropped");
const statIssuesEl = document.getElementById("statIssues");
const statTeamsExportedEl = document.getElementById("statTeamsExported");
const statExpectedSubmissionsEl = document.getElementById("statExpectedSubmissions");
const statSubmittedUniqueEl = document.getElementById("statSubmittedUnique");
const statMissingSubmissionsEl = document.getElementById("statMissingSubmissions");

const runAnalysisBtnEl = document.getElementById("runAnalysisBtn");
const analysisOutputEl = document.getElementById("analysisOutput");

let loadedConfig = null;
let parsedResult = null;

setStepStatus(step1StatusEl, "locked");
setStepStatus(step2StatusEl, "locked");
setStepStatus(step3StatusEl, "locked");

emailPreambleEl.addEventListener("input", refreshEmailPreview);
emailPostambleEl.addEventListener("input", refreshEmailPreview);

teamsJsonFileEl.addEventListener("change", async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await readFileText(file);
        const cfg = normalizeConfig(JSON.parse(text));
        loadedConfig = cfg;

        const teamCount = cfg.teams.length;
        const studentCount = cfg.teams.reduce((n, t) => n + t.students.length, 0);

        phase1MetaEl.innerHTML =
            '<span class="pill">loaded</span>' +
            `${teamCount} team(s), ${studentCount} student(s). Ready to generate outbound emails.`;

        downloadEmailZipBtnEl.disabled = false;
        parseRepliesBtnEl.disabled = false;
        downloadCsvZipBtnEl.disabled = true;
        runAnalysisBtnEl.disabled = true;
        parsedResult = null;
        analysisOutputEl.innerHTML = "";
        phase2StatsEl.hidden = true;
        issuesBoxEl.hidden = true;

        setStepStatus(step1StatusEl, "ready");
        setStepStatus(step2StatusEl, "ready");
        setStepStatus(step3StatusEl, "locked");
        refreshEmailPreview();
    } catch (err) {
        loadedConfig = null;
        downloadEmailZipBtnEl.disabled = true;
        parseRepliesBtnEl.disabled = true;
        downloadCsvZipBtnEl.disabled = true;
        runAnalysisBtnEl.disabled = true;
        phase2StatsEl.hidden = true;
        phase1MetaEl.textContent = `Config error: ${err.message}`;

        setStepStatus(step1StatusEl, "locked");
        setStepStatus(step2StatusEl, "locked");
        setStepStatus(step3StatusEl, "locked");
        refreshEmailPreview();
    }
});

downloadEmailZipBtnEl.addEventListener("click", async function () {
    if (!loadedConfig) return;
    if (typeof JSZip === "undefined") {
        phase1MetaEl.textContent = "Zip library unavailable. Reload with internet access to use zip download.";
        return;
    }

    const zip = new JSZip();
    const mailmergeRows = [["To", "Subject", "Body", "Team", "Rater"]];

    loadedConfig.teams.forEach((team) => {
        const teamFolder = zip.folder(slugify(team.name));

        team.students.forEach((student) => {
            const teammates = team.students.filter((s) => s.name !== student.name).map((s) => s.name);
            const subject = `[PA|${loadedConfig.module}|${team.name}|${student.name}] Peer Assessment Response`;
            const body = buildResponseBody(
                loadedConfig.module,
                loadedConfig.cohort,
                team.name,
                student.name,
                teammates,
                emailPreambleEl.value,
                emailPostambleEl.value
            );
            const eml = buildEml(student.email || "", subject, body);

            teamFolder.file(`${slugify(student.name)}.eml`, eml);
            mailmergeRows.push([student.email || "", subject, body, team.name, student.name]);
        });
    });

    zip.file("outlook_mailmerge.csv", toCsv(mailmergeRows));
    zip.file("teams.json", JSON.stringify(loadedConfig, null, 2) + "\n");

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "peer-assessment-outbound-emails.zip");
    phase1MetaEl.innerHTML = '<span class="pill">done</span>Outbound EML zip generated.';
    setStepStatus(step1StatusEl, "done");
    setStepStatus(step2StatusEl, "ready");
    refreshEmailPreview();
});

parseRepliesBtnEl.addEventListener("click", async function () {
    if (!loadedConfig) {
        phase2MetaEl.textContent = "Load teams.json first.";
        return;
    }

    const files = Array.from(replyFilesEl.files || []);
    if (!files.length) {
        phase2MetaEl.textContent = "Select one or more .eml/.txt files first.";
        return;
    }

    const strategy = dedupeStrategyEl.value;
    const byTeamName = new Map();
    loadedConfig.teams.forEach((t) => byTeamName.set(norm(t.name), t));

    const collected = new Map();
    const issues = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await readFileText(file);
        const block = extractBetweenMarkers(text);

        if (!block) {
            issues.push([file.name, "Markers not found"]);
            continue;
        }

        const parsed = parseResponseBlock(block);
        const team = byTeamName.get(norm(parsed.meta.TEAM || ""));
        if (!team) {
            issues.push([file.name, `Unknown team: ${parsed.meta.TEAM || ""}`]);
            continue;
        }

        const memberLookup = new Map(team.students.map((s) => [norm(s.name), s.name]));
        const raterName = memberLookup.get(norm(parsed.meta.RATER || ""));
        if (!raterName) {
            issues.push([file.name, `Unknown rater: ${parsed.meta.RATER || ""}`]);
            continue;
        }

        const rowMap = {};
        parsed.ratings.forEach((r) => {
            const name = memberLookup.get(norm(r.name));
            if (!name) return;
            rowMap[name] = {
                overall: toIntOrBlank(r.overall),
                engagement: toIntOrBlank(r.engagement),
                communication: toIntOrBlank(r.communication),
                quantity: toIntOrBlank(r.quantity),
                quality: toIntOrBlank(r.quality),
                justification: (r.justification || "").trim(),
            };
        });

        const teamName = team.name;
        if (!collected.has(teamName)) collected.set(teamName, []);
        collected.get(teamName).push({
            rater: raterName,
            ratings: rowMap,
            source: file.name,
            order: i,
        });
    }

    const dedupe = resolveDuplicates(collected, strategy);
    const outputs = buildCsvOutputs(loadedConfig, dedupe.resolved, issues);
    parsedResult = outputs;

    phase2MetaEl.innerHTML =
        '<span class="pill">parsed</span>' +
        `${files.length} file(s) processed, ${outputs.teamCsvs.length} team CSV(s) generated.`;

    statFilesProcessedEl.textContent = String(files.length);
    statValidRepliesEl.textContent = String(dedupe.validReplyCount);
    statDuplicatesDroppedEl.textContent = String(dedupe.dropped);
    statIssuesEl.textContent = String(issues.length);
    statTeamsExportedEl.textContent = String(outputs.teamCsvs.length);
    statExpectedSubmissionsEl.textContent = String(outputs.summary.expected);
    statSubmittedUniqueEl.textContent = String(outputs.summary.submitted);
    statMissingSubmissionsEl.textContent = String(outputs.summary.missing);
    phase2StatsEl.hidden = false;

    if (issues.length) {
        issuesBoxEl.hidden = false;
        issuesBoxEl.textContent = `${issues.length} issue(s) found. Included in parse_issues.csv.`;
    } else {
        issuesBoxEl.hidden = true;
        issuesBoxEl.textContent = "";
    }

    downloadCsvZipBtnEl.disabled = false;
    runAnalysisBtnEl.disabled = outputs.teamCsvs.length === 0;
    setStepStatus(step2StatusEl, "done");
    setStepStatus(step3StatusEl, outputs.teamCsvs.length ? "ready" : "locked");
});

downloadCsvZipBtnEl.addEventListener("click", async function () {
    if (!parsedResult) return;
    if (typeof JSZip === "undefined") {
        phase2MetaEl.textContent = "Zip library unavailable. Reload with internet access to use zip download.";
        return;
    }

    const zip = new JSZip();
    parsedResult.teamCsvs.forEach((x) => zip.file(x.fileName, x.csvText));
    zip.file("submission_dashboard.csv", parsedResult.dashboardCsv);
    zip.file("missing_students.csv", parsedResult.missingCsv);
    if (parsedResult.issuesCsv) zip.file("parse_issues.csv", parsedResult.issuesCsv);

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "peer-assessment-parsed-outputs.zip");
});

runAnalysisBtnEl.addEventListener("click", function () {
    if (!parsedResult || !parsedResult.teamCsvs.length) return;

    const groups = parsedResult.teamCsvs
        .map((x) => parseGroupData(x.csvText, x.fileName))
        .filter(Boolean);

    if (!groups.length) {
        analysisOutputEl.innerHTML = "<p>No valid CSVs to analyse.</p>";
        return;
    }

    analysisOutputEl.innerHTML = groups.length === 1 ? renderReport(groups[0]) : renderCohortView(groups);
    setStepStatus(step3StatusEl, "done");
});

function setStepStatus(el, state) {
    if (!el) return;
    el.classList.remove("locked", "ready", "done");
    el.classList.add(state);
    if (state === "done") el.textContent = "Done";
    if (state === "ready") el.textContent = "Ready";
    if (state === "locked") el.textContent = "Locked";
}

function normalizeConfig(cfg) {
    if (!cfg || typeof cfg !== "object") throw new Error("Invalid JSON object");
    if (!cfg.module || !cfg.cohort || !Array.isArray(cfg.teams)) {
        throw new Error("Config must include module, cohort, and teams[]");
    }

    const teams = cfg.teams.map((team) => {
        if (!team.name || !Array.isArray(team.students)) {
            throw new Error("Each team needs name and students[]");
        }

        const students = team.students.map((s) => {
            if (typeof s === "string") return { name: s.trim(), email: "" };
            if (s && typeof s === "object" && s.name) {
                return { name: String(s.name).trim(), email: String(s.email || "").trim() };
            }
            throw new Error(`Invalid student entry in team ${team.name}`);
        });

        if (!students.length) throw new Error(`Team ${team.name} has no students`);
        return { name: String(team.name).trim(), students };
    });

    return {
        module: String(cfg.module).trim(),
        cohort: String(cfg.cohort).trim(),
        teams,
    };
}

function buildResponseBody(moduleCode, cohort, teamName, raterName, teammates, preamble, postamble) {
    const lines = [];
    if (String(preamble || "").trim()) {
        lines.push(String(preamble).trim());
        lines.push("");
    }

    lines.push("Please complete this template and reply, keeping the subject unchanged.");
    lines.push("For each teammate, provide both numeric ratings and a plain-text feedback comment.");
    lines.push("Use one line per teammate in CSV format:");
    lines.push("Name,Overall(0-9),Engagement(0-9),Communication(0-9),Quantity(1-5),Quality(1-5),Justification");
    lines.push("The final column is free text feedback (single line per teammate).");
    lines.push("If your feedback contains commas, wrap the feedback in double quotes.");
    lines.push("Please keep names in column 1 unchanged.");
    lines.push("");
    lines.push(BEGIN_MARKER);
    lines.push(`MODULE,${moduleCode}`);
    lines.push(`COHORT,${cohort}`);
    lines.push(`TEAM,${teamName}`);
    lines.push(`RATER,${raterName}`);
    teammates.forEach((mate) => lines.push(`${mate},,,,,,Write one or two sentences of constructive feedback`));
    lines.push(END_MARKER);
    lines.push("");
    lines.push("Important: do not change names in the first column.");

    if (String(postamble || "").trim()) {
        lines.push("");
        lines.push(String(postamble).trim());
    }

    return lines.join("\n");
}

function refreshEmailPreview() {
    if (!loadedConfig || !loadedConfig.teams.length) {
        previewMetaEl.textContent = "Load teams.json to preview the outbound email template.";
        emailPreviewEl.textContent = "";
        return;
    }

    const team = loadedConfig.teams[0];
    const student = team.students[0];
    if (!team || !student) {
        previewMetaEl.textContent = "No team/student available in config for preview.";
        emailPreviewEl.textContent = "";
        return;
    }

    const teammates = team.students.filter((s) => s.name !== student.name).map((s) => s.name);
    const subject = `[PA|${loadedConfig.module}|${team.name}|${student.name}] Peer Assessment Response`;
    const body = buildResponseBody(
        loadedConfig.module,
        loadedConfig.cohort,
        team.name,
        student.name,
        teammates,
        emailPreambleEl.value,
        emailPostambleEl.value
    );
    const eml = buildEml(student.email || "", subject, body);

    previewMetaEl.textContent = `Previewing first outbound message: ${team.name} -> ${student.name}`;
    emailPreviewEl.textContent = eml;
}

function buildEml(to, subject, body) {
    const headers = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
    ];
    return headers.join("\n") + "\n\n" + body + "\n";
}

function extractBetweenMarkers(text) {
    const b = text.indexOf(BEGIN_MARKER);
    const e = text.indexOf(END_MARKER);
    if (b === -1 || e === -1 || e <= b) return null;
    return text.slice(b + BEGIN_MARKER.length, e).trim();
}

function parseResponseBlock(block) {
    const lines = block
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);

    const meta = {};
    const ratings = [];

    lines.forEach((line) => {
        const parts = parseCsvLine(line).map((x) => x.trim());
        const key = (parts[0] || "").toUpperCase();

        if (["MODULE", "COHORT", "TEAM", "RATER"].includes(key)) {
            meta[key] = parts[1] || "";
            return;
        }

        ratings.push({
            name: parts[0] || "",
            overall: parts[1] || "",
            engagement: parts[2] || "",
            communication: parts[3] || "",
            quantity: parts[4] || "",
            quality: parts[5] || "",
            justification: normalizeFeedbackText(parts.slice(6).join(",").trim()),
        });
    });

    return { meta, ratings };
}

function parseCsvLine(line) {
    const row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const next = line[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ",") {
                row.push(field);
                field = "";
            } else {
                field += ch;
            }
        }
    }

    row.push(field);
    return row;
}

function normalizeFeedbackText(value) {
    let text = String(value || "").trim();
    if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
        text = text.slice(1, -1).replace(/""/g, '"').trim();
    }
    return text;
}

function resolveDuplicates(collected, strategy) {
    if (strategy === "all") {
        let allCount = 0;
        collected.forEach((entries) => {
            allCount += entries.length;
        });
        return { resolved: collected, dropped: 0, validReplyCount: allCount };
    }

    const resolved = new Map();
    let dropped = 0;
    let validReplyCount = 0;
    collected.forEach((entries, teamName) => {
        const byRater = new Map();
        entries.forEach((e) => {
            const key = norm(e.rater);
            if (!byRater.has(key)) byRater.set(key, []);
            byRater.get(key).push(e);
        });

        const out = [];
        byRater.forEach((rows) => {
            rows.sort((a, b) => a.order - b.order);
            out.push(strategy === "first" ? rows[0] : rows[rows.length - 1]);
            dropped += Math.max(0, rows.length - 1);
        });

        out.sort((a, b) => a.order - b.order);
        resolved.set(teamName, out);
        validReplyCount += out.length;
    });

    return { resolved, dropped, validReplyCount };
}

function buildCsvOutputs(cfg, resolved, issues) {
    const teamCsvs = [];
    const dashboard = [["team", "expected_students", "submitted_unique", "missing_count", "missing_students", "rows_exported"]];
    const missing = [["team", "student"]];
    const summary = { expected: 0, submitted: 0, missing: 0 };

    cfg.teams.forEach((team) => {
        const members = team.students.map((s) => s.name);
        const entries = resolved.get(team.name) || [];

        const headers = ["Select your name"];
        members.forEach((m) => {
            headers.push(`Please rate overall contribution from ${m}`);
            headers.push(`Justify your rating for ${m}`);
            headers.push(`Please rate ${m} level of engagement`);
            headers.push(`Please rate ${m} communication skills`);
            headers.push(`Please rate quantity of contribution from ${m}`);
            headers.push(`Please rate quality of contribution from ${m}`);
        });

        const rows = [headers];
        entries.forEach((entry) => {
            const row = [entry.rater];
            members.forEach((m) => {
                const rr = entry.ratings[m] || {};
                row.push(rr.overall ?? "");
                row.push(rr.justification ?? "");
                row.push(rr.engagement ?? "");
                row.push(rr.communication ?? "");
                row.push(rr.quantity ?? "");
                row.push(rr.quality ?? "");
            });
            rows.push(row);
        });

        const csvText = toCsv(rows);
        const fileName = `${slugify(team.name)}.csv`;
        teamCsvs.push({ teamName: team.name, fileName, csvText });

        const submittedSet = new Set(entries.map((e) => norm(e.rater)));
        const missingNames = members.filter((m) => !submittedSet.has(norm(m)));
        missingNames.forEach((m) => missing.push([team.name, m]));

        summary.expected += members.length;
        summary.submitted += submittedSet.size;
        summary.missing += missingNames.length;

        dashboard.push([
            team.name,
            members.length,
            submittedSet.size,
            missingNames.length,
            missingNames.join(" | "),
            entries.length,
        ]);
    });

    const issuesCsv = issues.length ? toCsv([["file", "issue"], ...issues]) : "";

    return {
        teamCsvs,
        dashboardCsv: toCsv(dashboard),
        missingCsv: toCsv(missing),
        issuesCsv,
        summary,
    };
}

function toIntOrBlank(v) {
    const s = String(v ?? "").trim();
    if (!s) return "";
    const n = Number.parseInt(s, 10);
    return Number.isNaN(n) ? "" : n;
}

function toCsv(rows) {
    return rows
        .map((row) =>
            row
                .map((cell) => {
                    const value = String(cell ?? "");
                    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
                })
                .join(",")
        )
        .join("\n");
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "team";
}

function norm(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function readFileText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(String(ev.target.result || ""));
        reader.onerror = () => reject(reader.error || new Error("File read failed"));
        reader.readAsText(file);
    });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// --- Analysis logic (copied from main app pipeline) ---

function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (c === '"' && next === '"') {
                field += '"';
                i++;
            } else if (c === '"') {
                inQuotes = false;
            } else {
                field += c;
            }
        } else {
            if (c === '"') {
                inQuotes = true;
            } else if (c === ",") {
                row.push(field);
                field = "";
            } else if (c === "\n") {
                row.push(field);
                field = "";
                if (row.length > 1 || (row[0] || "").trim() !== "") rows.push(row);
                row = [];
            } else {
                field += c;
            }
        }
    }

    row.push(field);
    if (row.length > 1 || (row[0] || "").trim() !== "") rows.push(row);
    return rows;
}

function parseGroupData(text, filename) {
    const rows = parseCSV(text);
    if (!rows.length) return null;

    const headers = rows[0];
    const data = rows.slice(1);

    const overallPattern = /Please rate (?:the )?overall contribution from (.+)/i;
    const students = {};

    headers.forEach((header, i) => {
        const match = overallPattern.exec(header);
        if (match) {
            const name = match[1].trim();
            students[name] = { overall: i, justification: i + 1, extra: [] };
        }
    });

    const nameCol = headers.findIndex((h) => /select your name|your name/i.test(h));

    const taken = new Set();
    Object.values(students).forEach((c) => {
        taken.add(c.overall);
        taken.add(c.justification);
    });
    if (nameCol !== -1) taken.add(nameCol);

    Object.entries(students).forEach(([name, cols]) => {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const namePattern = new RegExp(esc + "['\u2019]?s?\\s*", "gi");

        headers.forEach((header, j) => {
            if (taken.has(j)) return;
            if (!header.toLowerCase().includes(name.toLowerCase())) return;

            let label = header.replace(namePattern, "").trim();
            label = label.replace(/^\s*please\s+rate\s*/i, "").trim();
            label = label.replace(/^[\s\-\u2013\u2014:]+/, "").trim();
            if (!label) label = header;

            cols.extra.push({ col: j, label });
            taken.add(j);
        });
    });

    function bankersRound(n) {
        const f = Math.floor(n);
        const frac = n - f;
        if (frac !== 0.5 && frac !== -0.5) return Math.round(n);
        return f % 2 === 0 ? f : f + 1;
    }

    const rawAvgs = {};
    const nonAttendees = new Set();
    const extraAvgs = {};

    Object.entries(students).forEach(([student, cols]) => {
        const scores = [];
        const extraScores = {};
        (cols.extra || []).forEach((ec) => {
            extraScores[ec.label] = [];
        });

        data.forEach((row) => {
            const rater = nameCol !== -1 ? row[nameCol] : null;
            if (rater === student) return;

            const score = Number.parseInt(row[cols.overall], 10);
            if (!Number.isNaN(score)) scores.push(score);

            (cols.extra || []).forEach((ec) => {
                const s = Number.parseInt(row[ec.col], 10);
                if (!Number.isNaN(s)) extraScores[ec.label].push(s);
            });
        });

        rawAvgs[student] = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        if (scores.length > 0 && scores.every((s) => s === 0)) nonAttendees.add(student);

        extraAvgs[student] = {};
        Object.entries(extraScores).forEach(([label, vals]) => {
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            extraAvgs[student][label] = Math.max(0, Math.min(9, bankersRound(avg)));
        });
    });

    const target = 5;
    const attendeeAvgs = Object.entries(rawAvgs)
        .filter(([student]) => !nonAttendees.has(student))
        .map(([, avg]) => avg)
        .sort((a, b) => a - b);

    const groupMean = attendeeAvgs.length ? attendeeAvgs[Math.floor(attendeeAvgs.length / 2)] : 0;
    const adjustment = target - groupMean;

    const normalised = {};
    Object.entries(rawAvgs).forEach(([student, raw]) => {
        if (nonAttendees.has(student)) {
            normalised[student] = 0;
        } else {
            let n = bankersRound(raw + adjustment);
            n = Math.max(0, Math.min(9, n));
            normalised[student] = n;
        }
    });

    const comments = {};
    Object.entries(students).forEach(([student, cols]) => {
        comments[student] = [];
        data.forEach((row) => {
            const rater = nameCol !== -1 ? row[nameCol] : null;
            if (rater === student) return;
            const comment = (row[cols.justification] || "").trim();
            if (comment && !/^\d+$/.test(comment)) comments[student].push(comment);
        });
    });

    return { filename, students, rawAvgs, normalised, comments, groupMean, adjustment, nonAttendees, extraAvgs };
}

function renderReport({ students, rawAvgs, normalised, comments, groupMean, adjustment, nonAttendees, extraAvgs }) {
    const studentList = Object.keys(students);
    const firstCols = students[studentList[0]] || {};
    const extraLabels = (firstCols.extra || []).map((ec) => ec.label);

    let html = "";
    html += `<h2>Summary Statistics</h2>`;
    html += `<p>Total students: ${studentList.length}</p>`;
    html += `<table><thead><tr><th></th><th></th></tr></thead><tbody>`;
    html += `<tr><td>Group median (raw)</td><td>${groupMean.toFixed(2)}</td></tr>`;
    html += `<tr><td>Normalisation adjustment</td><td>${adjustment >= 0 ? "+" : ""}${adjustment.toFixed(2)}</td></tr>`;
    html += `<tr><td>Target</td><td>5</td></tr>`;
    html += `</tbody></table>`;

    if (nonAttendees.size > 0) {
        html += `<p><em>Non-attendees excluded from normalisation: ${[...nonAttendees].join(", ")}</em></p>`;
    }

    html += `<h2>Summary Table</h2>`;

    let tableHead = `<thead>`;
    if (extraLabels.length) {
        tableHead += `<tr><th colspan="3"></th><th colspan="${extraLabels.length}" style="text-align:center;background:var(--amber-bg);color:var(--amber-text);font-size:0.8em;letter-spacing:0.03em;border-bottom:none;">Extra scores (not used in the calculations)</th></tr>`;
    }
    const extraHeaders = extraLabels
        .map((lbl) => `<th style="background:var(--amber-bg);color:var(--amber-text);">${escapeHtml(lbl)}</th>`)
        .join("");
    tableHead += `<tr><th>Student</th><th>Raw Avg</th><th>Score</th>${extraHeaders}</tr></thead>`;

    html += `<table>${tableHead}<tbody>`;
    studentList.forEach((student) => {
        const scoreDisplay = nonAttendees.has(student) ? "DNA" : normalised[student];
        const extraCells = extraLabels
            .map((lbl) => {
                const avg = (extraAvgs[student] || {})[lbl];
                return `<td style="background:var(--amber-bg);">${avg !== undefined ? avg : "-"}</td>`;
            })
            .join("");

        html += `<tr><td>${escapeHtml(student)}</td><td>${rawAvgs[student].toFixed(2)}</td><td>${scoreDisplay}</td>${extraCells}</tr>`;
    });
    html += `</tbody></table>`;

    const normVals = studentList.filter((s) => !nonAttendees.has(s)).map((s) => normalised[s]);
    const grpMedian = normVals.length ? [...normVals].sort((a, b) => a - b)[Math.floor(normVals.length / 2)] : 0;
    html += `<p><b>Group median (normalised):</b> ${grpMedian}</p>`;

    html += `<h2>Individual Feedback</h2>`;
    studentList.forEach((student) => {
        html += `<div class="feedback-card">`;
        html += `<h3>${escapeHtml(student)}</h3>`;

        if (nonAttendees.has(student)) {
            html += `<p><b>Score:</b> 0 <em>(Did not attend - excluded from group normalisation)</em></p>`;
        } else {
            html += `<p><b>Score:</b> ${normalised[student]}</p>`;
        }

        if (extraLabels.length) {
            const studentExtra = extraAvgs[student] || {};
            const extraRows = extraLabels
                .map((lbl) => `<tr><td>${escapeHtml(lbl)}</td><td>${studentExtra[lbl] !== undefined ? studentExtra[lbl] : "-"}</td></tr>`)
                .join("");
            html += `<p style="margin-bottom:0.3em;"><b>Extra scores</b> <span style="font-size:0.82em;color:var(--amber-text);">(not used in calculations)</span></p>`;
            html += `<table style="width:auto;margin:0 0 0.75em;font-size:0.9em;"><thead><tr><th>Dimension</th><th>Peer avg</th></tr></thead><tbody>${extraRows}</tbody></table>`;
        }

        if ((comments[student] || []).length) {
            html += `<b>Peer Comments:</b><ul>`;
            comments[student].forEach((c) => {
                html += `<li>${escapeHtml(c)}</li>`;
            });
            html += `</ul>`;
        } else {
            html += `<b>Peer Comments:</b> <em>(No comments provided)</em>`;
        }

        html += `</div>`;
    });

    return html;
}

function renderCohortView(groups) {
    const totalStudents = groups.reduce((n, g) => n + Object.keys(g.students).length, 0);
    const totalDNA = groups.reduce((n, g) => n + g.nonAttendees.size, 0);

    let html = `<h2>Cohort Overview</h2>`;
    html += `<p>${groups.length} group(s) • ${totalStudents} students total • ${totalDNA} DNA flag(s)</p>`;

    html += `<h3>Group Summary</h3>`;
    html += `<table><thead><tr><th>Group</th><th>Students</th><th>DNA</th><th>Median (raw)</th><th>Adjustment</th><th>Score range</th><th>Median (norm)</th></tr></thead><tbody>`;

    groups.forEach((g) => {
        const students = Object.keys(g.students);
        const vals = students
            .filter((s) => !g.nonAttendees.has(s))
            .map((s) => g.normalised[s])
            .sort((a, b) => a - b);

        const med = vals.length ? vals[Math.floor(vals.length / 2)] : "-";
        const range = vals.length ? `${vals[0]}-${vals[vals.length - 1]}` : "-";

        html += `<tr><td>${escapeHtml(g.filename)}</td><td>${students.length}</td><td>${g.nonAttendees.size || "-"}</td><td>${g.groupMean.toFixed(2)}</td><td>${g.adjustment >= 0 ? "+" : ""}${g.adjustment.toFixed(2)}</td><td>${range}</td><td>${med}</td></tr>`;
    });

    html += `</tbody></table>`;

    const dist = Array(10).fill(0);
    groups.forEach((g) => {
        Object.entries(g.normalised).forEach(([student, score]) => {
            if (!g.nonAttendees.has(student)) dist[score]++;
        });
    });

    html += `<h3>Score Distribution (excluding DNA)</h3>`;
    html += `<table><thead><tr><th>Score</th>${dist.map((_, i) => `<th style="text-align:center;">${i}</th>`).join("")}</tr></thead>`;
    html += `<tbody><tr><td>Count</td>${dist.map((n) => `<td style="text-align:center;">${n || "-"}</td>`).join("")}</tr></tbody></table>`;

    if (totalDNA > 0) {
        html += `<h3>Did Not Attend</h3><ul>`;
        groups.forEach((g) => {
            g.nonAttendees.forEach((name) => {
                html += `<li>${escapeHtml(name)} <span style="color:var(--text-muted);font-size:0.9em;">(${escapeHtml(g.filename)})</span></li>`;
            });
        });
        html += `</ul>`;
    }

    html += `<h2>Individual Group Reports</h2>`;
    groups.forEach((g) => {
        const n = Object.keys(g.students).length;
        const dna = g.nonAttendees.size ? `, ${g.nonAttendees.size} DNA` : "";
        html += `<details class="group-report"><summary>${escapeHtml(g.filename)} <span style="font-weight:normal;color:var(--text-muted);font-size:0.88em;">(${n} student(s)${dna})</span></summary><div class="group-report-body">${renderReport(g)}</div></details>`;
    });

    return html;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
