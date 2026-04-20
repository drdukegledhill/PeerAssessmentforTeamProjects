/**
 * Peer Assessment Report – client-side application
 *
 * All processing runs entirely in the browser. No data is sent to any server.
 *
 * Entry points:
 *   - #csvFile  input  → processSingleFile()  → parseGroupData() → renderReport()
 *   - #csvFiles input  → processCohortFiles() → parseGroupData() → renderCohortView()
 *
 * Processing pipeline (per CSV):
 *   1. parseCSV()       – raw text → 2D array of strings
 *   2. parseGroupData() – 2D array → structured data object
 *   3. renderReport()   – data object → HTML string (single group)
 *      renderCohortView() – array of data objects → HTML string (cohort overview + groups)
 */

'use strict';

const exportActionsEl = document.getElementById('exportActions');
const exportCsvBtnEl = document.getElementById('exportCsvBtn');
const exportSummaryCsvBtnEl = document.getElementById('exportSummaryCsvBtn');
const exportMetaEl = document.getElementById('exportMeta');
let latestProcessed = null;

// ─────────────────────────────────────────────────────────────────────────────
// Section navigation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All navigable section IDs, in page order.
 * Used by the sticky nav, scroll-spy, and hash deep-linking.
 */
const sectionIds = [
    'tool',
    'how-to-use',
    'setup',
    'csv-format',
    'normalisation',
    'extra-scores',
    'rationale',
    'simulator'
];

/** Highlight the nav link for the given section ID, and clear all others. */
function activateNavLink(sectionId) {
    document.querySelectorAll('.section-nav a[data-section]').forEach(a => {
        a.classList.toggle('active', a.dataset.section === sectionId);
    });
}

/** Smooth-scroll to the element with the given ID. */
function scrollToSection(sectionId) {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Intercept nav link clicks: update the URL hash without a full page reload,
// then scroll and highlight.
document.querySelectorAll('.section-nav a[data-section]').forEach(a => {
    a.addEventListener('click', e => {
        e.preventDefault();
        const sectionId = a.dataset.section;
        history.pushState(null, '', '#section=' + sectionId);
        scrollToSection(sectionId);
        activateNavLink(sectionId);
    });
});

/**
 * Parse the URL hash and, if it contains a valid section ID, scroll to that
 * section and highlight the corresponding nav link.
 * Called on page load and whenever the hash changes.
 */
function handleHash() {
    const hash = location.hash;
    if (hash.startsWith('#section=')) {
        const sectionId = hash.slice(9); // strip '#section='
        if (sectionIds.includes(sectionId)) {
            scrollToSection(sectionId);
            activateNavLink(sectionId);
        }
    }
}

window.addEventListener('load', handleHash);
window.addEventListener('hashchange', handleHash);

/**
 * Scroll-spy: update the active nav link as the user scrolls.
 *
 * A section is considered "current" once its top edge has passed the bottom of
 * the sticky nav bar (NAV_HEIGHT px from the top of the viewport). We iterate
 * all sections and keep the last one that satisfies this condition, so the nav
 * always reflects the section the user is currently reading.
 */
const NAV_HEIGHT = 55; // approximate sticky nav height in pixels

window.addEventListener('scroll', () => {
    let current = null;
    for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= NAV_HEIGHT) current = id;
    }
    if (current) {
        history.replaceState(null, '', '#section=' + current);
        activateNavLink(current);
    }
}, { passive: true }); // passive: true improves scroll performance

// ─────────────────────────────────────────────────────────────────────────────
// Tab switching (Setting Up section: Google Forms / Microsoft Forms)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Switch the active tab within a .tabs container.
 *
 * @param {HTMLElement} btn     - The tab button that was clicked.
 * @param {string}      panelId - The ID of the panel to show.
 */
function switchTab(btn, panelId) {
    const tabs = btn.closest('.tabs');
    // Deactivate all buttons and panels in this tab group
    tabs.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
    });
    tabs.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    // Activate the clicked button and its corresponding panel
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(panelId).classList.add('active');
}

// ─────────────────────────────────────────────────────────────────────────────
// File upload handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single-group upload.
 * Reads one CSV file, processes it, and renders the group report.
 */
document.getElementById('csvFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const data = parseGroupData(ev.target.result, file.name);
        document.getElementById('output').innerHTML =
            data ? renderReport(data) : '<p>No data found.</p>';
        latestProcessed = data ? { mode: 'single', groups: [data] } : null;
        syncExportActions();
    };
    reader.readAsText(file);
});

/**
 * Cohort (multiple groups) upload.
 * Reads all selected CSV files in parallel (using indexed results to preserve
 * file order regardless of which FileReader finishes first), then renders the
 * cohort overview once all files are loaded.
 */
document.getElementById('csvFiles').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const results = new Array(files.length); // pre-allocated so order is preserved
    let loaded = 0;

    files.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = function(ev) {
            results[idx] = parseGroupData(ev.target.result, file.name);
            if (++loaded === files.length) {
                // All files loaded – filter out any that failed to parse, then render
                const groups = results.filter(Boolean);
                document.getElementById('output').innerHTML =
                    groups.length ? renderCohortView(groups) : '<p>No valid data found.</p>';
                latestProcessed = groups.length ? { mode: 'cohort', groups } : null;
                syncExportActions();
            }
        };
        reader.readAsText(file);
    });
});

exportCsvBtnEl.addEventListener('click', function() {
    if (!latestProcessed || !latestProcessed.groups.length) return;

    const csvText = buildExportCsv(latestProcessed.groups);
    const fileName = latestProcessed.mode === 'cohort'
        ? 'peer-assessment-cohort-report.csv'
        : `peer-assessment-${safeFileStem(latestProcessed.groups[0].filename)}-report.csv`;

    downloadCsv(csvText, fileName);
});

exportSummaryCsvBtnEl.addEventListener('click', function() {
    if (!latestProcessed || latestProcessed.mode !== 'cohort') return;

    const csvText = buildCohortSummaryCsv(latestProcessed.groups);
    downloadCsv(csvText, 'peer-assessment-cohort-summary.csv');
});

function syncExportActions() {
    if (!latestProcessed || !latestProcessed.groups.length) {
        exportActionsEl.hidden = true;
        exportMetaEl.textContent = '';
        return;
    }

    const totalStudents = latestProcessed.groups.reduce(
        (n, g) => n + Object.keys(g.students).length,
        0
    );

    exportActionsEl.hidden = false;
    exportSummaryCsvBtnEl.hidden = latestProcessed.mode !== 'cohort';
    exportMetaEl.textContent = latestProcessed.mode === 'cohort'
        ? `${latestProcessed.groups.length} groups processed, ${totalStudents} student rows ready to export.`
        : `${totalStudents} student rows ready to export.`;
}

function buildExportCsv(groups) {
    const allExtraLabels = [];
    const seenLabels = new Set();

    groups.forEach(g => {
        const firstStudent = Object.keys(g.students)[0];
        const extra = ((g.students[firstStudent] || {}).extra || []).map(ec => ec.label);
        extra.forEach(label => {
            if (!seenLabels.has(label)) {
                seenLabels.add(label);
                allExtraLabels.push(label);
            }
        });
    });

    const baseHeaders = [
        'Group',
        'Student',
        'Status',
        'Raw Avg',
        'Normalised Score',
        'Group Median Raw',
        'Adjustment',
        'Group Median Normalised',
        'Peer Comments'
    ];
    const headers = baseHeaders.concat(allExtraLabels.map(label => `Extra: ${label}`));

    const rows = [headers];

    groups.forEach(g => {
        const studentList = Object.keys(g.students);
        const groupNormMedian = getGroupNormalisedMedian(g);

        studentList.forEach(student => {
            const status = g.nonAttendees.has(student) ? 'DNA' : 'Attended';
            const scoreValue = g.nonAttendees.has(student) ? 0 : g.normalised[student];
            const row = [
                g.filename,
                student,
                status,
                g.rawAvgs[student].toFixed(2),
                String(scoreValue),
                g.groupMean.toFixed(2),
                g.adjustment.toFixed(2),
                String(groupNormMedian),
                (g.comments[student] || []).join(' | ')
            ];

            allExtraLabels.forEach(label => {
                const value = (g.extraAvgs[student] || {})[label];
                row.push(value === undefined ? '' : String(value));
            });

            rows.push(row);
        });
    });

    return rows.map(toCsvLine).join('\n');
}

function getGroupNormalisedMedian(groupData) {
    const values = Object.keys(groupData.students)
        .filter(student => !groupData.nonAttendees.has(student))
        .map(student => groupData.normalised[student])
        .sort((a, b) => a - b);

    return values.length ? values[Math.floor(values.length / 2)] : '';
}

function buildCohortSummaryCsv(groups) {
    const headers = [
        'Group',
        'Students',
        'Attended',
        'DNA',
        'Median Raw',
        'Adjustment',
        'Median Normalised',
        'Min Normalised',
        'Max Normalised'
    ];

    const rows = [headers];

    groups.forEach(groupData => {
        const students = Object.keys(groupData.students);
        const attendees = students.filter(student => !groupData.nonAttendees.has(student));
        const normScores = attendees
            .map(student => groupData.normalised[student])
            .sort((a, b) => a - b);

        const medianNorm = normScores.length
            ? normScores[Math.floor(normScores.length / 2)]
            : '';

        rows.push([
            groupData.filename,
            String(students.length),
            String(attendees.length),
            String(groupData.nonAttendees.size),
            groupData.groupMean.toFixed(2),
            groupData.adjustment.toFixed(2),
            String(medianNorm),
            normScores.length ? String(normScores[0]) : '',
            normScores.length ? String(normScores[normScores.length - 1]) : ''
        ]);
    });

    return rows.map(toCsvLine).join('\n');
}

function toCsvLine(cells) {
    return cells.map(cell => {
        const value = String(cell ?? '');
        if (/[",\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
        return value;
    }).join(',');
}

function safeFileStem(name) {
    return String(name || 'group')
        .replace(/\.csv$/i, '')
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'group';
}

function downloadCsv(csvText, fileName) {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into a 2D array of strings.
 *
 * Handles:
 *   - Quoted fields (including commas and newlines inside quotes)
 *   - Escaped double-quotes ("")
 *   - Windows (CRLF), Unix (LF), and old Mac (CR) line endings
 *   - Empty trailing lines (skipped)
 *
 * Empty cells are preserved as empty strings (not null/undefined), so column
 * indices remain stable across all rows.
 *
 * @param  {string}   text - Raw CSV text.
 * @returns {string[][]}   - Array of rows; each row is an array of field strings.
 */
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    // Normalise line endings to LF so the parser only needs to handle '\n'
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < text.length; i++) {
        const c    = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (c === '"' && next === '"') {
                field += '"'; // escaped double-quote inside a quoted field
                i++;          // skip the second quote
            } else if (c === '"') {
                inQuotes = false; // closing quote
            } else {
                field += c;
            }
        } else {
            if (c === '"') {
                inQuotes = true; // opening quote
            } else if (c === ',') {
                row.push(field);
                field = '';
            } else if (c === '\n') {
                row.push(field);
                field = '';
                // Skip completely empty trailing lines
                if (row.length > 1 || row[0].trim() !== '') rows.push(row);
                row = [];
            } else {
                field += c;
            }
        }
    }

    // Flush the last field/row (file may not end with a newline)
    row.push(field);
    if (row.length > 1 || row[0].trim() !== '') rows.push(row);

    return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data processing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a CSV text string and compute all scores and comments for one group.
 *
 * Column detection:
 *   - Respondent name : header contains "select your name" or "your name"
 *   - Overall score   : header matches /Please rate (?:the )?overall contribution from (.+)/i
 *   - Justification   : column immediately after each overall score column
 *   - Extra dimensions: any remaining column whose header contains a student's name
 *
 * Normalisation:
 *   - Raw average per student = mean of all peer scores (self excluded)
 *   - DNA detection: students whose every peer score is 0 are flagged and excluded
 *     from the normalisation reference so they don't skew everyone else's scores
 *   - Group reference = median of attendee raw averages (median is used instead of
 *     mean because it is robust to outliers at the low end of the distribution)
 *   - Adjustment = 5 − group median
 *   - Normalised score = bankersRound(raw + adjustment), clamped to 0–9
 *
 * @param  {string} text     - Raw CSV text.
 * @param  {string} filename - Source filename, used as a label in cohort view.
 * @returns {object|null}    - Structured data object, or null if parsing failed.
 */
function parseGroupData(text, filename) {
    const rows = parseCSV(text);
    if (!rows.length) return null;

    const headers = rows[0];
    const data    = rows.slice(1);

    // ── Detect students from "overall contribution" column headers ────────────
    // Pattern: "Please rate [the] overall contribution from <Name>"
    const overallPattern = /Please rate (?:the )?overall contribution from (.+)/i;
    let students = {};

    headers.forEach((header, i) => {
        const match = overallPattern.exec(header);
        if (match) {
            const name = match[1].trim();
            students[name] = {
                overall:       i,       // column index for the numeric score
                justification: i + 1,   // comment column immediately follows
                extra:         []       // additional rating dimensions (populated below)
            };
        }
    });

    // ── Find the respondent-identity column ───────────────────────────────────
    // Used to exclude self-assessments (a student rating themselves).
    let nameCol = headers.findIndex(h => /select your name|your name/i.test(h));

    // ── Detect extra rating dimensions ────────────────────────────────────────
    // Any column not already claimed (overall / justification / name) whose
    // header contains a student's name is treated as an extra dimension.
    // E.g. "Please rate Alice level of engagement" → label: "level of engagement"
    const takenCols = new Set();
    Object.values(students).forEach(cols => {
        takenCols.add(cols.overall);
        takenCols.add(cols.justification);
    });
    if (nameCol !== -1) takenCols.add(nameCol);

    Object.entries(students).forEach(([name, cols]) => {
        // Build a regex that strips the student's name (+ possessive 's) from labels
        const nameEsc    = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namePattern = new RegExp(nameEsc + "['\u2019]?s?\\s*", 'gi');

        headers.forEach((header, j) => {
            if (takenCols.has(j)) return;
            if (!header.toLowerCase().includes(name.toLowerCase())) return;

            // Derive a short label by stripping the student name and lead-in text
            let label = header.replace(namePattern, '').trim();
            label = label.replace(/^\s*please\s+rate\s*/i, '').trim();
            label = label.replace(/^[\s\-\u2013\u2014:]+/, '').trim();
            if (!label) label = header; // fallback: use the full header

            cols.extra.push({ col: j, label });
            takenCols.add(j);
        });
    });

    // ── Banker's rounding (round half to even) ────────────────────────────────
    // Used instead of standard rounding to avoid a systematic upward bias.
    // E.g. 4.5 → 4, 5.5 → 6, 6.5 → 6, 7.5 → 8
    function bankersRound(n) {
        const f    = Math.floor(n);
        const frac = n - f;
        if (frac !== 0.5 && frac !== -0.5) return Math.round(n);
        return (f % 2 === 0) ? f : f + 1; // round to nearest even
    }

    // ── Calculate raw averages and detect non-attendees ───────────────────────
    let rawAvgs      = {};
    let nonAttendees = new Set();
    let extraAvgs    = {};

    Object.entries(students).forEach(([student, cols]) => {
        let scores      = [];
        let extraScores = {};
        (cols.extra || []).forEach(ec => { extraScores[ec.label] = []; });

        data.forEach(row => {
            const rater = nameCol !== -1 ? row[nameCol] : null;
            if (rater === student) return; // skip self-assessment

            // Collect the main overall contribution score
            const score = parseInt(row[cols.overall]);
            if (!isNaN(score)) scores.push(score);

            // Collect scores for any extra rating dimensions
            (cols.extra || []).forEach(ec => {
                const s = parseInt(row[ec.col]);
                if (!isNaN(s)) extraScores[ec.label].push(s);
            });
        });

        rawAvgs[student] = scores.length
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0;

        // DNA detection: every peer gave this student a 0
        if (scores.length > 0 && scores.every(s => s === 0)) {
            nonAttendees.add(student);
        }

        // Average and round each extra dimension (displayed only, not normalised)
        extraAvgs[student] = {};
        Object.entries(extraScores).forEach(([label, vals]) => {
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            extraAvgs[student][label] = Math.max(0, Math.min(9, bankersRound(avg)));
        });
    });

    // ── Normalise scores ──────────────────────────────────────────────────────
    // Reference = median of attendee raw averages (DNA students excluded so they
    // don't distort the median and inflate everyone else's normalised score).
    const target = 5;

    const attendeeAvgs = Object.entries(rawAvgs)
        .filter(([student]) => !nonAttendees.has(student))
        .map(([, avg]) => avg)
        .sort((a, b) => a - b);

    // Lower-median (floor index) used for even-length arrays, consistent with
    // the Python version which uses integer division.
    const groupMean = attendeeAvgs.length
        ? attendeeAvgs[Math.floor(attendeeAvgs.length / 2)]
        : 0;

    const adjustment = target - groupMean;

    let normalised = {};
    Object.entries(rawAvgs).forEach(([student, raw]) => {
        if (nonAttendees.has(student)) {
            normalised[student] = 0; // DNA: score recorded as 0
        } else {
            let normScore = bankersRound(raw + adjustment);
            normScore = Math.max(0, Math.min(9, normScore)); // clamp to 0–9
            normalised[student] = normScore;
        }
    });

    // ── Extract peer comments ─────────────────────────────────────────────────
    // Justification column immediately follows each overall score column.
    // Self-assessment comments are excluded. Cells that contain only a number
    // are filtered out (they are likely scores from an adjacent column that
    // shifted in due to a malformed export).
    let comments = {};
    Object.entries(students).forEach(([student, cols]) => {
        comments[student] = [];
        data.forEach(row => {
            const rater = nameCol !== -1 ? row[nameCol] : null;
            if (rater === student) return; // skip self

            const comment = (row[cols.justification] || '').trim();
            if (comment && !/^\d+$/.test(comment)) {
                comments[student].push(comment);
            }
        });
    });

    return { filename, students, rawAvgs, normalised, comments, groupMean, adjustment, nonAttendees, extraAvgs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Report rendering – single group
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the HTML for a single group report.
 *
 * Sections:
 *   1. Summary Statistics – student count, group median, adjustment, target
 *   2. Summary Table      – one row per student: raw avg, normalised score,
 *                           and any extra dimension scores
 *   3. Individual Feedback – one card per student with score, extra scores,
 *                            and all peer comments
 *
 * @param  {object} groupData - Data object returned by parseGroupData().
 * @returns {string}          - HTML string (not yet inserted into the DOM).
 */
function renderReport({ students, rawAvgs, normalised, comments, groupMean, adjustment, nonAttendees, extraAvgs }) {
    const studentList = Object.keys(students);

    // Extra dimension labels are consistent across all students in a group,
    // so we read them from the first student's column list.
    const firstCols   = students[studentList[0]] || {};
    const extraLabels = (firstCols.extra || []).map(ec => ec.label);

    let html = '';

    // ── Summary Statistics ────────────────────────────────────────────────────
    html += `<h2>Summary Statistics</h2>`;
    html += `<p>Total students: ${studentList.length}</p>`;
    html += `<table><thead><tr><th></th><th></th></tr></thead><tbody>`;
    html += `<tr><td>Group median (raw)</td><td>${groupMean.toFixed(2)}</td></tr>`;
    html += `<tr><td>Normalisation adjustment</td><td>${adjustment >= 0 ? '+' : ''}${adjustment.toFixed(2)}</td></tr>`;
    html += `<tr><td>Target</td><td>5</td></tr>`;
    html += `</tbody></table>`;

    if (nonAttendees.size > 0) {
        html += `<p><em>Non-attendees excluded from normalisation: ${[...nonAttendees].join(', ')}</em></p>`;
    }

    // ── Summary Table ─────────────────────────────────────────────────────────
    html += `<h2>Summary Table</h2>`;

    // If extra dimensions are present, add a spanning header row above them
    let tableHead = `<thead>`;
    if (extraLabels.length) {
        tableHead += `<tr>
            <th colspan="3"></th>
            <th colspan="${extraLabels.length}"
                style="text-align:center;background:var(--amber-bg);color:var(--amber-text);
                       font-size:0.8em;letter-spacing:0.03em;border-bottom:none;">
                Extra scores (not used in the calculations)
            </th>
        </tr>`;
    }
    const extraHeaders = extraLabels
        .map(lbl => `<th style="background:var(--amber-bg);color:var(--amber-text);">${lbl}</th>`)
        .join('');
    tableHead += `<tr><th>Student</th><th>Raw Avg</th><th>Score</th>${extraHeaders}</tr></thead>`;

    html += `<table>${tableHead}<tbody>`;
    studentList.forEach(student => {
        const scoreDisplay = nonAttendees.has(student) ? 'DNA' : normalised[student];
        const extraCells   = extraLabels.map(lbl => {
            const avg = (extraAvgs[student] || {})[lbl];
            return `<td style="background:var(--amber-bg);">${avg !== undefined ? avg : '-'}</td>`;
        }).join('');
        html += `<tr>
            <td>${student}</td>
            <td>${rawAvgs[student].toFixed(2)}</td>
            <td>${scoreDisplay}</td>
            ${extraCells}
        </tr>`;
    });
    html += `</tbody></table>`;

    // Group median of normalised scores (DNA excluded)
    const normVals  = studentList.filter(s => !nonAttendees.has(s)).map(s => normalised[s]);
    const grpMedian = normVals.length
        ? [...normVals].sort((a, b) => a - b)[Math.floor(normVals.length / 2)]
        : 0;
    html += `<p><b>Group median (normalised):</b> ${grpMedian}</p>`;

    // ── Individual Feedback ───────────────────────────────────────────────────
    html += `<h2>Individual Feedback</h2>`;

    studentList.forEach(student => {
        html += `<div class="feedback-card">`;
        html += `<h3>${student}</h3>`;

        if (nonAttendees.has(student)) {
            html += `<p><b>Score:</b> 0 <em>(Did not attend - excluded from group normalisation)</em></p>`;
        } else {
            html += `<p><b>Score:</b> ${normalised[student]}</p>`;
        }

        // Extra dimension scores (shown for reference, not used in normalisation)
        if (extraLabels.length) {
            const studentExtra = extraAvgs[student] || {};
            const extraRows    = extraLabels.map(lbl => {
                const avg = studentExtra[lbl];
                return `<tr><td>${lbl}</td><td>${avg !== undefined ? avg : '-'}</td></tr>`;
            }).join('');
            html += `<p style="margin-bottom:0.3em;">
                <b>Extra scores</b>
                <span style="font-size:0.82em;color:var(--amber-text);">(not used in calculations)</span>
            </p>`;
            html += `<table style="width:auto;margin:0 0 0.75em;font-size:0.9em;">
                <thead><tr><th>Dimension</th><th>Peer avg</th></tr></thead>
                <tbody>${extraRows}</tbody>
            </table>`;
        }

        // Peer comments
        if (comments[student].length) {
            html += `<b>Peer Comments:</b><ul>`;
            comments[student].forEach(comment => { html += `<li>${comment}</li>`; });
            html += `</ul>`;
        } else {
            html += `<b>Peer Comments:</b> <em>(No comments provided)</em>`;
        }

        html += `</div>`;
    });

    return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report rendering – cohort view (multiple groups)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the HTML for a cohort-level view across multiple groups.
 *
 * Sections:
 *   1. Cohort Overview   – total groups, students, DNA flags
 *   2. Group Summary     – one row per group: students, DNA, median (raw),
 *                          adjustment, score range, median (norm)
 *   3. Score Distribution – count of each normalised score 0–9 across all groups
 *                           (DNA students excluded)
 *   4. Did Not Attend    – consolidated list of DNA students with their group
 *   5. Individual Groups – each group's full report in a collapsible <details>
 *
 * Each group is processed independently; normalisation is not applied across
 * groups — only within each group's own data.
 *
 * @param  {object[]} groups - Array of data objects returned by parseGroupData().
 * @returns {string}         - HTML string.
 */
function renderCohortView(groups) {
    const totalStudents = groups.reduce((n, g) => n + Object.keys(g.students).length, 0);
    const totalDNA      = groups.reduce((n, g) => n + g.nonAttendees.size, 0);

    let html = `<h2>&#x1F4CA; Cohort Overview</h2>`;
    html += `<p>
        ${groups.length} group${groups.length !== 1 ? 's' : ''}
        &bull; ${totalStudents} students total
        &bull; ${totalDNA} DNA flag${totalDNA !== 1 ? 's' : ''}
    </p>`;

    // ── Group Summary Table ───────────────────────────────────────────────────
    html += `<h3>Group Summary</h3>`;
    html += `<table><thead><tr>
        <th>Group</th>
        <th>Students</th>
        <th>DNA</th>
        <th>Median (raw)</th>
        <th>Adjustment</th>
        <th>Score range</th>
        <th>Median (norm)</th>
    </tr></thead><tbody>`;

    groups.forEach(g => {
        const studentList = Object.keys(g.students);

        // Sorted normalised scores (attendees only) for range and median
        const normVals = studentList
            .filter(s => !g.nonAttendees.has(s))
            .map(s => g.normalised[s])
            .sort((a, b) => a - b);

        const grpNormMedian = normVals.length
            ? normVals[Math.floor(normVals.length / 2)]
            : '&ndash;';
        const scoreRange = normVals.length
            ? `${normVals[0]}&ndash;${normVals[normVals.length - 1]}`
            : '&ndash;';

        html += `<tr>
            <td>${g.filename}</td>
            <td>${studentList.length}</td>
            <td>${g.nonAttendees.size || '&ndash;'}</td>
            <td>${g.groupMean.toFixed(2)}</td>
            <td>${g.adjustment >= 0 ? '+' : ''}${g.adjustment.toFixed(2)}</td>
            <td>${scoreRange}</td>
            <td>${grpNormMedian}</td>
        </tr>`;
    });

    html += `</tbody></table>`;

    // ── Score Distribution ────────────────────────────────────────────────────
    // Count how many students received each normalised score 0–9 across all groups.
    // DNA students are excluded (their score is 0 by convention, not by merit).
    const dist = Array(10).fill(0);
    groups.forEach(g => {
        Object.entries(g.normalised).forEach(([student, score]) => {
            if (!g.nonAttendees.has(student)) dist[score]++;
        });
    });

    html += `<h3>Score Distribution (all students, excluding DNA)</h3>`;
    html += `<table><thead><tr><th>Score</th>`;
    dist.forEach((_, i) => { html += `<th style="text-align:center;">${i}</th>`; });
    html += `</tr></thead><tbody><tr><td>Count</td>`;
    dist.forEach(c => { html += `<td style="text-align:center;">${c || '&ndash;'}</td>`; });
    html += `</tr></tbody></table>`;

    // ── Did Not Attend List ───────────────────────────────────────────────────
    if (totalDNA > 0) {
        html += `<h3>Did Not Attend</h3><ul>`;
        groups.forEach(g => {
            g.nonAttendees.forEach(name => {
                html += `<li>${name} <span style="color:var(--text-muted);font-size:0.9em;">(${g.filename})</span></li>`;
            });
        });
        html += `</ul>`;
    }

    // ── Individual Group Reports ──────────────────────────────────────────────
    // Each group's full report is wrapped in a <details> element so the lecturer
    // can expand only the groups they want to inspect.
    html += `<h2>Individual Group Reports</h2>`;

    groups.forEach(g => {
        const n         = Object.keys(g.students).length;
        const dnaSuffix = g.nonAttendees.size ? `, ${g.nonAttendees.size} DNA` : '';

        html += `<details class="group-report">`;
        html += `<summary>
            ${g.filename}
            <span style="font-weight:normal;color:var(--text-muted);font-size:0.88em;">
                (${n} student${n !== 1 ? 's' : ''}${dnaSuffix})
            </span>
        </summary>`;
        html += `<div class="group-report-body">${renderReport(g)}</div>`;
        html += `</details>`;
    });

    return html;
}
