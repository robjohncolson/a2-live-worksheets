import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { Script } from 'node:vm';

const html = readFileSync('mobile-home.html', 'utf8');
const client = readFileSync('roster-client.js', 'utf8');
function source(name) {
  const start = html.indexOf('  function ' + name + '(');
  return html.slice(start, html.indexOf('\n  }', start) + 4);
}
function mobile() {
  const w = new JSDOM(html, { url: 'https://desk.test', runScripts: 'outside-only' }).window;
  w.fetch = vi.fn();
  w.eval(client);
  w.localStorage.setItem('a2_roster.v1', JSON.stringify({ studentId: 'fictional-1', username: 'peach_owl', token: 'test-token', role: 'student', mustChangePassword: true }));
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  return w;
}

describe('WI-B mobile student launch', () => {
  it('uses a blocking native dialog on returning sessions and only closes after a successful change', async () => {
    const w = mobile();
    w.eval(source('openMobilePasswordChange'));
    w.eval(source('refreshIdentity'));
    w.refreshIdentity();
    const dialog = w.document.getElementById('mobile-password-change');
    expect(dialog.open).toBe(true);
    const cancel = new w.Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    const submit = () => dialog.querySelector('form').onsubmit({ preventDefault() {} });
    const pw = dialog.querySelector('#mobile-password-new');
    const confirm = dialog.querySelector('#mobile-password-confirm');
    w.rosterClient.changePassword = vi.fn().mockResolvedValue({ ok: false, error: 'Try again' });
    pw.value = 'long-enough'; confirm.value = 'different';
    await submit();
    expect(w.rosterClient.changePassword).not.toHaveBeenCalled();
    confirm.value = pw.value;
    await submit();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Try again');
    w.rosterClient.changePassword.mockImplementation(async () => {
      const session = JSON.parse(w.localStorage.getItem('a2_roster.v1'));
      session.mustChangePassword = false;
      w.localStorage.setItem('a2_roster.v1', JSON.stringify(session));
      return { ok: true };
    });
    await submit();
    expect(w.document.getElementById('mobile-password-change')).toBeNull();
    expect(html).toContain("window.addEventListener('a2:password-change-required', openMobilePasswordChange)");
    expect(html).toContain('if (result.mustChangePassword) openMobilePasswordChange();');
    w.close();
  });

  it.each([{ username: 'peach_owl', startingPassword: '<starter>' }, { username: 'peach_owl' }, { ambiguous: true }])('hands duplicate signup to the correct sign-in path: %j', result => {
    const w = mobile();
    const content = w.document.createElement('div');
    content.id = 'nf-content';
    w.document.body.appendChild(content);
    w._nfBackToDial = vi.fn();
    w._nfRenderPassword = vi.fn();
    w.eval('var _nfPicked = null;\n' + source('_nfAccountExists'));
    w._nfAccountExists(result);
    const host = w.document.getElementById('nf-content');
    expect(host.querySelectorAll('button')).toHaveLength(1);
    if (result.startingPassword) expect(host.textContent).toContain('Your starting password is <starter>.');
    else if (result.ambiguous) expect(host.textContent).toContain("Use 'Find my name on the class list'");
    else expect(host.textContent).toContain('Ask your teacher to reset your password.');
    expect(host.querySelector('starter')).toBeNull();
    host.querySelector('button').click();
    if (result.ambiguous) expect(w._nfBackToDial).toHaveBeenCalledOnce();
    else {
      expect(w._nfPicked.username).toBe('peach_owl');
      expect(w._nfRenderPassword).toHaveBeenCalledOnce();
    }
    w.close();
  });

  it('hides live and cached grade numbers while retaining lesson data; teachers and the flag restore them', () => {
    const w = mobile();
    w.eval('var _gradeByTopic = {}, _lastLessons = [];\n' + source('_normTopic') + '\n' + source('_applyGradeData'));
    const data = { lessons: [{ topic: '1.1', lessonGrade: 80 }], quarters: [{ quarter: 'Q1', quarterGrade: 85 }] };
    w._applyGradeData(data, false);
    const pill = w.document.getElementById('gradepill');
    expect(pill.textContent).toBe('Your grade is in Schoology for now.');
    expect(w._gradeByTopic['1.1'].lessonGrade).toBe(80);
    w.localStorage.setItem('a2_roster.v1', JSON.stringify({ studentId: 'teacher-1', role: 'teacher' }));
    w._applyGradeData(data, false);
    expect(pill.textContent).toContain('85%');
    w.localStorage.setItem('a2_roster.v1', JSON.stringify({ studentId: 'fictional-1', role: 'student' }));
    w.A2_STUDENT_GRADES_VISIBLE = true;
    w._applyGradeData(data, false);
    expect(pill.textContent).toContain('85%');
    w.close();
  });

  it('all inline scripts still parse', () => {
    const dom = new JSDOM(html);
    for (const script of dom.window.document.querySelectorAll('script:not([src])')) {
      if (!script.type || script.type === 'text/javascript') expect(() => new Script(script.textContent)).not.toThrow();
    }
    dom.window.close();
  });
});
