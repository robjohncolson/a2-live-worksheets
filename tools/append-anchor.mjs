#!/usr/bin/env node
// append-anchor.mjs — print one ANCHORS.md line for a snapshot file. The mirror's
// running tail of these is the human-readable chain of daily class seals; the last
// line's root is what the next /admin/snapshot pull passes as ?prev= to chain on.
//
//   node tools/append-anchor.mjs <snapshot.json> >> ANCHORS.md
//
// Line format: <asOfDateNY>  root=<epoch.root>  prev=<epoch.prev|->  students=<n>  records=<n>  generatedAt=<iso>

import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: append-anchor <snapshot.json>'); process.exit(2); }

const s = JSON.parse(fs.readFileSync(file, 'utf8'));
const records = (s.students || []).reduce((n, st) => n + (((st.bundle && st.bundle.records) || []).length), 0);
const iso = new Date(s.generatedAt || Date.now()).toISOString();
const epoch = s.epoch || {};
process.stdout.write(
  `${s.asOfDateNY}  root=${epoch.root || '-'}  prev=${epoch.prev || '-'}  students=${(s.students || []).length}  records=${records}  generatedAt=${iso}\n`
);
