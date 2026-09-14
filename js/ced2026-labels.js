// Display projections only. Callers keep OLD lesson identifiers for all work.
(function (root) {
  'use strict';

  let registryProvider = () => null;
  let fingerprint = null;
  let metadata = {};
  let folded = {};
  let labels = new Map();

  function configureCedLabels(provider) {
    registryProvider = typeof provider === 'function' ? provider : () => provider;
    fingerprint = null;
  }

  function compareTopics(left, right) {
    const a = left.split('.').map(Number);
    const b = right.split('.').map(Number);
    return a[0] - b[0] || a[1] - b[1];
  }

  function expandedTopicKeys(oldKey) {
    const keys = [];
    for (const part of String(oldKey || '').split('+')) {
      const key = part.trim();
      const range = /^(\d+)\.(\d+)[–-](?:(\d+)\.)?(\d+)$/.exec(key);
      if (!range || (range[3] && range[3] !== range[1])
        || Number(range[4]) < Number(range[2]) || Number(range[4]) - Number(range[2]) > 30) {
        keys.push(key);
        continue;
      }
      for (let lesson = Number(range[2]); lesson <= Number(range[4]); lesson += 1) keys.push(range[1] + '.' + lesson);
    }
    return [...new Set(keys)];
  }

  function refreshMetadata(registry) {
    const source = registry === undefined ? registryProvider() : registry;
    const next = Object.assign({}, root.CED2026_CROSSWALK || {});
    if (source && source.map) Object.assign(next, source.map);
    for (const [key, lesson] of Object.entries(source && source.lessons || {})) {
      // An explicit null clears a live overlay; a missing field uses fallback.
      if (lesson && Object.prototype.hasOwnProperty.call(lesson, 'ced2026')) next[key] = lesson.ced2026;
    }
    const nextFingerprint = JSON.stringify(next);
    if (nextFingerprint === fingerprint) return;
    fingerprint = nextFingerprint;
    metadata = next;
    folded = {};
    labels = new Map();
    for (const key of Object.keys(metadata).sort(compareTopics)) {
      const entry = metadata[key];
      if (!entry || entry.status !== 'core' || !entry.newTopic) continue;
      if (!folded[entry.newTopic]) folded[entry.newTopic] = [];
      folded[entry.newTopic].push(key);
    }
  }

  function cedLabel(oldKey, registry) {
    refreshMetadata(registry);
    const key = String(oldKey || '');
    if (labels.has(key)) return labels.get(key);

    const entry = metadata[key];
    let result = { id: '', label: 'Lesson', unit: null, bonus: false,
      bonusUnit: null, text: 'Lesson', day: null, days: 1, mapped: false };
    if (entry && entry.status === 'bonus') {
      const label = String(entry.newLabel || 'Additional practice').replace(/^Beyond the Exam:\s*/i, '');
      result = { id: '★', label, unit: null, bonus: true,
        bonusUnit: entry.bonusUnit || null, text: '★ Beyond the Exam · ' + label,
        day: null, days: 1, mapped: true };
    } else if (entry && entry.status === 'core' && /^[1-5]\.\d+$/.test(entry.newTopic)
      && Number.isInteger(entry.newUnit) && entry.newUnit >= 1 && entry.newUnit <= 5) {
      const group = folded[entry.newTopic] || [key];
      const day = group.length > 1 ? group.indexOf(key) + 1 : null;
      const label = String(entry.newLabel || 'Lesson');
      result = { id: entry.newTopic, label, unit: entry.newUnit, bonus: false,
        bonusUnit: null, text: entry.newTopic + ' · ' + label + (day ? ' · Day ' + day : ''),
        day, days: group.length, mapped: true };
    } else if (key.includes('+') || /^\d+\.\d+[–-](?:\d+\.)?\d+$/.test(key)) {
      const parts = expandedTopicKeys(key).filter(part => part !== key).map(part => cedLabel(part, registry));
      if (parts.length && parts.every(part => part.mapped)) {
        const units = [...new Set(parts.filter(part => !part.bonus).map(part => part.unit))];
        result = { id: parts.map(part => part.id).join(' / '),
          label: parts.map(part => part.label).join(' / '),
          unit: units.length === 1 ? units[0] : null,
          bonus: parts.every(part => part.bonus), bonusUnit: null,
          text: parts.map(part => part.text).join(' / '), day: null, days: 1, mapped: true };
      }
    }
    labels.set(key, result);
    return result;
  }

  function cedUnitClass(oldKey, registry) {
    const label = cedLabel(oldKey, registry);
    if (label.bonus) return 'bonus';
    return label.unit ? 'u' + label.unit : '';
  }

  function cedTopicCoverage(oldKeys, registry) {
    const topics = new Set();
    let bonus = false;
    for (const key of (oldKeys || []).flatMap(expandedTopicKeys)) {
      const label = cedLabel(key, registry);
      if (!label.mapped) continue;
      if (label.bonus) bonus = true;
      else if (/^[1-5]\.\d+$/.test(label.id)) topics.add(label.id);
    }
    const ordered = [...topics].sort(compareTopics);
    const ranges = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const start = ordered[index];
      let end = start;
      while (index + 1 < ordered.length) {
        const currentParts = end.split('.').map(Number);
        const nextParts = ordered[index + 1].split('.').map(Number);
        if (nextParts[0] !== currentParts[0] || nextParts[1] !== currentParts[1] + 1) break;
        end = ordered[++index];
      }
      ranges.push(start === end ? start : start + '–' + end);
    }
    const text = ranges.length ? 'CED topics ' + ranges.join(' · ') : '';
    if (bonus) return (text ? text + ' · ' : '') + '★ Beyond the Exam';
    return text || 'Course work';
  }

  function cedLegacyUnitLabel(oldUnit, registry) {
    refreshMetadata(registry);
    const unit = String(oldUnit || '').replace(/^U/i, '');
    const keys = Object.keys(metadata).filter(key => key.split('.')[0] === unit);
    return cedTopicCoverage(keys, registry);
  }

  // Use only on raw legacy display strings, never on URLs, keys, or CED labels.
  function cedDisplayText(raw, registry) {
    const text = String(raw || '');
    const arrow = /^(\d+\.\d+)\s*(?:→|->)\s*\d+\.\d+\s*[·:—-]/.exec(text);
    if (arrow) return cedLabel(arrow[1], registry).text;
    return text.replace(/\bU(\d+)[_-]?L(?:esson)?(\d+(?:[–-](?:\d+\.)?\d+)?)\b|\bUnit\s+(\d+)\s*(?:[·,:-]\s*)?Lesson\s+(\d+(?:[–-](?:\d+\.)?\d+)?)\b|\b([1-9]\.\d+(?:[–-](?:\d+\.)?\d+)?)\b|\b(?:Unit\s+|U)([6-9])\b/gi,
      (_match, unit, lesson, wordUnit, wordLesson, topic, legacyUnit) => legacyUnit
        ? cedLegacyUnitLabel(legacyUnit, registry)
        : cedLabel(topic || (unit || wordUnit) + '.' + (lesson || wordLesson), registry).text);
  }

  // Prose can contain decimal grades. Translate explicit lesson references only.
  function cedReferenceText(raw, registry) {
    return String(raw || '').replace(/\b(?:Topic|Lesson)\s+([1-9]\.\d+(?:[–-](?:\d+\.)?\d+)?)\b|\bU(\d+)[_-]?L(?:esson)?(\d+(?:[–-](?:\d+\.)?\d+)?)\b|\bUnit\s+(\d+)\s*(?:[·,:-]\s*)?Lesson\s+(\d+(?:[–-](?:\d+\.)?\d+)?)\b|\b(?:Unit\s+|U)([6-9])\b/gi,
      (_match, topic, unit, lesson, wordUnit, wordLesson, legacyUnit) => legacyUnit
        ? cedLegacyUnitLabel(legacyUnit, registry)
        : cedLabel(topic || (unit || wordUnit) + '.' + (lesson || wordLesson), registry).text);
  }

  Object.assign(root, { configureCedLabels, cedLabel, cedUnitClass,
    cedTopicCoverage, cedLegacyUnitLabel, cedDisplayText, cedReferenceText });
})(typeof window !== 'undefined' ? window : globalThis);
