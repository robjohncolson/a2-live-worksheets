(async function () {
  const form = document.getElementById('check');
  const message = document.getElementById('message');
  const submit = document.getElementById('submit');
  let lesson;
  let requestId = crypto.randomUUID();
  const answers = () => Object.fromEntries(lesson.lessonCheck.map(item => [item.registryId,
    item.type === 'mc' ? form.elements[item.registryId].value : document.getElementById(item.registryId).value]));
  function signInWall() {
    const signedIn = !!window.rosterClient?.token();
    document.getElementById('wall').textContent = signedIn ? 'Answer all six items, then submit. You may retake this check.' : 'Sign in on the Desk to submit. You can read the items here.';
    submit.disabled = !signedIn || !lesson;
  }
  try {
    const response = await fetch('content/a2/lessons.json');
    lesson = (await response.json()).find(item => item.key === new URLSearchParams(location.search).get('lesson'));
    if (!lesson) throw new Error('Unknown lesson');
    document.getElementById('title').textContent = lesson.key + ' · ' + lesson.title;
    for (const item of lesson.lessonCheck) {
      const field = document.createElement('fieldset'); field.dataset.registryId = item.registryId;
      const prompt = document.createElement('legend'); prompt.textContent = item.prompt; field.append(prompt);
      if (item.image) { const img = document.createElement('img'); img.src = item.image; img.alt = 'Savvas graph for ' + item.registryId; field.append(img); }
      if (item.responseHint) { const hint = document.createElement('p'); hint.textContent = item.responseHint; field.append(hint); }
      if (item.type === 'mc') item.choices.forEach(choice => {
        const label = document.createElement('label'); const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = item.registryId; radio.value = choice[0]; radio.required = true;
        label.append(radio, document.createTextNode(choice)); field.append(label);
      });
      else { const input = document.createElement('input'); input.type = 'text'; input.id = item.registryId;
        input.dataset.answer = item.answer; input.required = true; input.setAttribute('aria-label', item.prompt); field.append(input); }
      const source = document.createElement('small'); source.textContent = item.registryId; field.append(source);
      const feedback = document.createElement('p'); feedback.className = 'feedback'; feedback.setAttribute('aria-live', 'polite'); field.append(feedback);
      field.addEventListener('change', () => {
        const correct = A2Answers.answerMatches(item.answer, answers()[item.registryId]);
        field.className = correct ? 'correct' : 'incorrect'; feedback.textContent = correct ? 'Correct' : 'Try again';
      });
      document.getElementById('items').append(field);
    }
    signInWall();
  } catch (error) { message.textContent = error.message; }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!window.rosterClient?.token() || !lesson) return signInWall();
    submit.disabled = true;
    try {
      const result = await A2Client.request('/ledger/record', { source: 'lesson-check', itemId: 'LC-' + lesson.key,
        lesson: lesson.key, answers: answers(), requestId });
      message.textContent = 'Attempt ' + result.attempt + ': ' + result.score.toFixed(2) + '/10. Best: ' + (result.bestScore ?? result.score).toFixed(2) + '/10.';
      requestId = crypto.randomUUID(); A2Client.changed();
    } catch (error) { message.textContent = 'Not submitted: ' + error.message + '. Retry when connected.'; }
    finally { signInWall(); }
  });
  document.getElementById('retake').addEventListener('click', () => {
    form.reset(); requestId = crypto.randomUUID(); message.textContent = '';
    form.querySelectorAll('fieldset').forEach(field => { field.className = ''; field.querySelector('.feedback').textContent = ''; });
    signInWall();
  });
  window.addEventListener('roster-session-changed', signInWall);
})();
