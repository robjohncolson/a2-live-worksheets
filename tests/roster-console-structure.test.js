/**
 * Structure and behavior tests for teacher-roster-console.html
 * Work Item B: Actions column, inline edit, duplicate prefill.
 *
 * Strategy: build the minimal DOM that the console JS expects
 * (view-tbody, one-name, one-section), then inject and exercise
 * the three helper functions (enterEditMode, exitEditMode, saveRow,
 * duplicateRow) extracted from the page script.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Load the console HTML and extract just the inline <script> block.
// We parse it in jsdom so the functions run in a real DOM context.
// ---------------------------------------------------------------------------

const HTML_PATH = path.resolve('teacher-roster-console.html');
const rawHtml = fs.readFileSync(HTML_PATH, 'utf8');

// Strip the external <script src="..."> tags so jsdom does not try to fetch
// roster_config.js / roster-client.js (they don't exist in the test env).
const cleanedHtml = rawHtml
  .replace(/<script\s+src="[^"]*"[^>]*><\/script>/g, '');

// ---------------------------------------------------------------------------
// Helper: build a jsdom window from the cleaned HTML.
// Returns { window, document, api mock }.
// ---------------------------------------------------------------------------

function makeWindow(apiMock) {
  const dom = new JSDOM(cleanedHtml, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const { window } = dom;

  // Provide minimal stubs the script references at load time.
  window.rosterClient = { token: () => null, current: () => null };

  // Stub fetch so api() calls are interceptable.
  window.fetch = apiMock || vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ ok: true, student: { studentId: 'abc', realName: 'Test', section: 'PeriodB', username: 'test1' } }),
  });

  return dom;
}

// ---------------------------------------------------------------------------
// Helper: render a fake student row into view-tbody using the same innerHTML
// pattern as the console, then wire the buttons the same way the console does
// (we call enterEditMode / exitEditMode / duplicateRow directly from the
// window after the page script has run).
// ---------------------------------------------------------------------------

function appendStudentRow(document, window, { studentId, realName, section }) {
  const tr = document.createElement('tr');
  tr.dataset.studentId = studentId || '';
  tr.dataset.realName  = realName  || '';
  tr.dataset.section   = section   || '';

  tr.innerHTML =
    '<td class="cell-real-name">' + realName + '</td>' +
    '<td class="uname mono">uname1</td>' +
    '<td class="cell-section">' + section + '</td>' +
    '<td>pw</td>' +
    '<td><span class="pill pill-ok">set</span></td>' +
    '<td class="hint">2026-01-01</td>' +
    '<td class="cell-actions">' +
      '<span class="btn-row">' +
        '<button class="btn-sm btn-edit">Edit</button>' +
        '<button class="btn-sm btn-dup">Duplicate</button>' +
      '</span>' +
    '</td>';

  // Wire buttons the same way the console does.
  tr.querySelector('.btn-edit').addEventListener('click', () =>
    window.enterEditMode(tr));
  tr.querySelector('.btn-dup').addEventListener('click', () =>
    window.duplicateRow(tr));

  document.getElementById('view-tbody').appendChild(tr);
  return tr;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('View Roster table -- Actions column structure', () => {
  let dom, document, window;

  beforeEach(() => {
    dom = makeWindow();
    document = dom.window.document;
    window   = dom.window;
  });

  it('renders an Actions <th> in the View Roster table header', () => {
    const headers = [...document.querySelectorAll('#view-out thead th')];
    const texts = headers.map(th => th.textContent.trim());
    expect(texts).toContain('Actions');
  });

  it('renders Edit and Duplicate buttons in an Actions cell', () => {
    appendStudentRow(document, window, {
      studentId: 'sid-1',
      realName:  'Ada Lovelace',
      section:   'PeriodB',
    });

    const tr = document.querySelector('#view-tbody tr');
    expect(tr.querySelector('.btn-edit')).not.toBeNull();
    expect(tr.querySelector('.btn-dup')).not.toBeNull();
    expect(tr.querySelector('.btn-edit').textContent).toBe('Edit');
    expect(tr.querySelector('.btn-dup').textContent).toBe('Duplicate');
  });

  it('stores studentId on the row as a data attribute', () => {
    appendStudentRow(document, window, {
      studentId: 'uuid-abc-123',
      realName:  'Alan Turing',
      section:   'PeriodE',
    });

    const tr = document.querySelector('#view-tbody tr');
    expect(tr.dataset.studentId).toBe('uuid-abc-123');
  });
});

describe('Edit mode -- enterEditMode', () => {
  let dom, document, window, tr;

  beforeEach(() => {
    dom = makeWindow();
    document = dom.window.document;
    window   = dom.window;

    tr = appendStudentRow(document, window, {
      studentId: 'sid-edit',
      realName:  'Marie Curie',
      section:   'PeriodB',
    });

    window.enterEditMode(tr);
  });

  it('swaps Real Name cell to a text input', () => {
    const nameCell = tr.querySelector('.cell-real-name');
    const input = nameCell.querySelector('input[type="text"]');
    expect(input).not.toBeNull();
    expect(input.value).toBe('Marie Curie');
  });

  it('swaps Section cell to a text input', () => {
    const sectionCell = tr.querySelector('.cell-section');
    const input = sectionCell.querySelector('input[type="text"]');
    expect(input).not.toBeNull();
    expect(input.value).toBe('PeriodB');
  });

  it('shows Save and Cancel buttons, hides Edit and Duplicate', () => {
    const actionsCell = tr.querySelector('.cell-actions');
    const buttons = [...actionsCell.querySelectorAll('button')];
    const labels = buttons.map(b => b.textContent.trim());
    expect(labels).toContain('Save');
    expect(labels).toContain('Cancel');
    expect(labels).not.toContain('Edit');
    expect(labels).not.toContain('Duplicate');
  });
});

describe('Edit mode -- exitEditMode (Cancel)', () => {
  let dom, document, window, tr;

  beforeEach(() => {
    dom = makeWindow();
    document = dom.window.document;
    window   = dom.window;

    tr = appendStudentRow(document, window, {
      studentId: 'sid-cancel',
      realName:  'Rosalind Franklin',
      section:   'PeriodE',
    });

    window.enterEditMode(tr);
    window.exitEditMode(tr);
  });

  it('restores Real Name cell text', () => {
    const nameCell = tr.querySelector('.cell-real-name');
    expect(nameCell.textContent).toBe('Rosalind Franklin');
    expect(nameCell.querySelector('input')).toBeNull();
  });

  it('restores Section cell text', () => {
    const sectionCell = tr.querySelector('.cell-section');
    expect(sectionCell.textContent).toBe('PeriodE');
    expect(sectionCell.querySelector('input')).toBeNull();
  });

  it('restores Edit and Duplicate buttons', () => {
    const actionsCell = tr.querySelector('.cell-actions');
    const labels = [...actionsCell.querySelectorAll('button')].map(b => b.textContent.trim());
    expect(labels).toContain('Edit');
    expect(labels).toContain('Duplicate');
    expect(labels).not.toContain('Save');
    expect(labels).not.toContain('Cancel');
  });
});

describe('Edit mode -- opening a second row cancels the first', () => {
  let dom, document, window, tr1, tr2;

  beforeEach(() => {
    dom = makeWindow();
    document = dom.window.document;
    window   = dom.window;

    tr1 = appendStudentRow(document, window, {
      studentId: 'sid-a', realName: 'Student A', section: 'PeriodB',
    });
    tr2 = appendStudentRow(document, window, {
      studentId: 'sid-b', realName: 'Student B', section: 'PeriodE',
    });

    window.enterEditMode(tr1);
    // Opening tr2 should cancel tr1.
    window.enterEditMode(tr2);
  });

  it('tr1 is back to read mode (no inputs)', () => {
    expect(tr1.querySelector('.cell-real-name input')).toBeNull();
  });

  it('tr2 is in edit mode (has inputs)', () => {
    expect(tr2.querySelector('.cell-real-name input')).not.toBeNull();
  });
});

describe('Save -- calls PATCH /roster/:studentId', () => {
  it('issues PATCH to /roster/<studentId> with realName and section', async () => {
    let capturedUrl, capturedInit;
    const fetchMock = vi.fn(async (url, init) => {
      capturedUrl  = url;
      capturedInit = init;
      return {
        status: 200,
        json: async () => ({
          ok: true,
          student: {
            studentId: 'sid-save',
            realName:  'Updated Name',
            section:   'PeriodX',
            username:  'uname1',
          },
        }),
      };
    });

    const dom = makeWindow(fetchMock);
    const document = dom.window.document;
    const window   = dom.window;

    const tr = appendStudentRow(document, window, {
      studentId: 'sid-save',
      realName:  'Original Name',
      section:   'PeriodB',
    });

    window.enterEditMode(tr);

    // Change the input values.
    const nameInput    = tr.querySelector('[data-role="edit-name"]');
    const sectionInput = tr.querySelector('[data-role="edit-section"]');
    nameInput.value    = 'Updated Name';
    sectionInput.value = 'PeriodX';

    // Create a dummy errSpan (saveRow expects one but we can pass a real element).
    const errSpan = document.createElement('span');

    await window.saveRow(tr, errSpan);

    // Verify the fetch call targeted PATCH /roster/sid-save.
    expect(capturedUrl).toContain('/roster/sid-save');
    expect(capturedInit.method).toBe('PATCH');

    const sentBody = JSON.parse(capturedInit.body);
    expect(sentBody.realName).toBe('Updated Name');
    expect(sentBody.section).toBe('PeriodX');
  });

  it('updates row cells on success and exits edit mode', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        ok: true,
        student: {
          studentId: 'sid-upd',
          realName:  'New Name',
          section:   'PeriodX',
          username:  'uname1',
        },
      }),
    }));

    const dom = makeWindow(fetchMock);
    const document = dom.window.document;
    const window   = dom.window;

    const tr = appendStudentRow(document, window, {
      studentId: 'sid-upd',
      realName:  'Old Name',
      section:   'PeriodB',
    });

    window.enterEditMode(tr);
    tr.querySelector('[data-role="edit-name"]').value    = 'New Name';
    tr.querySelector('[data-role="edit-section"]').value = 'PeriodX';

    const errSpan = document.createElement('span');
    await window.saveRow(tr, errSpan);

    // Row should be back in read mode.
    expect(tr.querySelector('.cell-real-name input')).toBeNull();
    expect(tr.querySelector('.cell-real-name').textContent).toBe('New Name');
    expect(tr.querySelector('.cell-section').textContent).toBe('PeriodX');
  });

  it('stays in edit mode and shows error on non-200 response', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 404,
      json: async () => ({ ok: false, error: 'Student not found' }),
    }));

    const dom = makeWindow(fetchMock);
    const document = dom.window.document;
    const window   = dom.window;

    const tr = appendStudentRow(document, window, {
      studentId: 'sid-404',
      realName:  'Ghost Student',
      section:   'PeriodB',
    });

    window.enterEditMode(tr);

    const errSpan = document.createElement('span');
    await window.saveRow(tr, errSpan);

    // Should stay in edit mode.
    expect(tr.querySelector('.cell-real-name input')).not.toBeNull();
    expect(errSpan.textContent).toContain('Student not found');
  });
});

describe('Duplicate -- prefills Add One Student form', () => {
  let dom, document, window;

  beforeEach(() => {
    dom = makeWindow();
    document = dom.window.document;
    window   = dom.window;
  });

  it('fills the one-name field with the source row real name', () => {
    const tr = appendStudentRow(document, window, {
      studentId: 'sid-dup',
      realName:  'Katherine Johnson',
      section:   'PeriodE',
    });

    window.duplicateRow(tr);

    expect(document.getElementById('one-name').value).toBe('Katherine Johnson');
  });

  it('fills the one-section field with the source row section', () => {
    const tr = appendStudentRow(document, window, {
      studentId: 'sid-dup2',
      realName:  'Dorothy Vaughan',
      section:   'PeriodB',
    });

    window.duplicateRow(tr);

    expect(document.getElementById('one-section').value).toBe('PeriodB');
  });

  it('does NOT submit the form or make a server call', () => {
    const fetchMock = vi.fn();

    const d2 = makeWindow(fetchMock);
    const doc2 = d2.window.document;
    const win2 = d2.window;

    const tr = appendStudentRow(doc2, win2, {
      studentId: 'sid-nosubmit',
      realName:  'Mary Jackson',
      section:   'PeriodE',
    });

    win2.duplicateRow(tr);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Delete -- deleteRow', () => {
  it('the row template wires a Delete button to deleteRow', () => {
    expect(rawHtml).toContain('btn-del');
    expect(rawHtml).toContain('window.deleteRow');
    expect(rawHtml).toMatch(/deleteRow\(tr\)/);
  });

  it('confirms before deleting and warns that work/grades are removed too', () => {
    // The cascade also deletes item_ledger, so the confirm must say so.
    expect(rawHtml).toMatch(/saved work \+ grades|work \+ grades|cannot be undone/i);
    expect(rawHtml).toMatch(/window\.confirm/);
  });

  it('calls DELETE /roster/:id and removes the row on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true, studentId: 'sid-del' }) });
    const dom = makeWindow(fetchMock);
    const document = dom.window.document;
    const window = dom.window;
    window.confirm = () => true;
    const tr = appendStudentRow(document, window, { studentId: 'sid-del', realName: 'Grace Hopper', section: 'PeriodX' });

    expect(document.querySelector('#view-tbody tr')).not.toBeNull();
    await window.deleteRow(tr);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(url).toMatch(/\/roster\/sid-del$/);
    expect(document.querySelector('#view-tbody tr')).toBeNull();
  });

  it('does nothing when the teacher cancels the confirm', async () => {
    const fetchMock = vi.fn();
    const dom = makeWindow(fetchMock);
    const document = dom.window.document;
    const window = dom.window;
    window.confirm = () => false;
    const tr = appendStudentRow(document, window, { studentId: 'sid-keep', realName: 'Ada', section: 'PeriodX' });

    await window.deleteRow(tr);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('#view-tbody tr')).not.toBeNull();
  });

  it('keeps the row when the server rejects the delete', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 500, json: async () => ({ ok: false, error: 'Database error' }) });
    const dom = makeWindow(fetchMock);
    const document = dom.window.document;
    const window = dom.window;
    window.confirm = () => true;
    const tr = appendStudentRow(document, window, { studentId: 'sid-fail', realName: 'Edith', section: 'PeriodX' });

    await window.deleteRow(tr);

    expect(document.querySelector('#view-tbody tr')).not.toBeNull();
  });

  it('keeps the row + shows Forbidden on a 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, json: async () => ({ ok: false, error: 'forbidden' }) });
    const dom = makeWindow(fetchMock);
    const document = dom.window.document;
    const window = dom.window;
    window.confirm = () => true;
    const tr = appendStudentRow(document, window, { studentId: 'sid-401', realName: 'Mae', section: 'PeriodX' });

    await window.deleteRow(tr);

    expect(document.querySelector('#view-tbody tr')).not.toBeNull();
    expect(document.getElementById('view-msg').textContent).toMatch(/forbidden/i);
  });

  it('fails CLOSED — aborts (no fetch) when window.confirm is unavailable', async () => {
    const fetchMock = vi.fn();
    const dom = makeWindow(fetchMock);
    const document = dom.window.document;
    const window = dom.window;
    window.confirm = undefined; // no confirmation channel
    const tr = appendStudentRow(document, window, { studentId: 'sid-noconfirm', realName: 'Joan', section: 'PeriodX' });

    await window.deleteRow(tr);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('#view-tbody tr')).not.toBeNull();
  });
});
