import http from 'node:http';
import { Duplex } from 'node:stream';

const TOKEN_SECRET = 'apstats-golden-token-v1';
const TEACHER_KEY = 'apstats-golden-teacher-v1';

function createFakeRosterDb(students) {
  const roster = students.map((student) => ({
    student_id: student.id,
    login_username: student.id,
    real_name: student.id,
    section: student.section,
    role: 'student',
  }));

  return {
    async insertRoster() { return { data: null, error: null }; },
    async findByUsername(username) {
      return { data: roster.find((row) => row.login_username === username) || null, error: null };
    },
    async findByStudentId(studentId) {
      return { data: roster.find((row) => row.student_id === studentId) || null, error: null };
    },
    async listRoster(section) {
      const data = section ? roster.filter((row) => row.section === section) : roster.slice();
      return { data, error: null };
    },
    async getRoleByStudentId(studentId) {
      return roster.some((row) => row.student_id === studentId) ? 'student' : null;
    },
  };
}

function createFakeLedgerDb(students) {
  const rowsByStudent = Object.fromEntries(students.map((student) => [
    student.id,
    student.records.map((record) => ({ ...record, student_id: student.id })),
  ]));

  return {
    async getLedgerByStudent(studentId) {
      return { data: rowsByStudent[studentId] || [], error: null };
    },
    async insertLedgerRow() { return { data: null, error: null }; },
    async updateLedgerReceipt() { return { error: null }; },
    async getLedgerByItem() { return { data: [], error: null }; },
    async getRowsByLedgerIds() { return { data: [], error: null }; },
  };
}

function fixedDateClass(asOf, NativeDate) {
  const fixedMs = NativeDate.parse(`${asOf}T17:00:00.000Z`);

  return class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedMs]));
    }

    static now() {
      return fixedMs;
    }
  };
}

async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
}

async function closeServer(server) {
  await new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

async function getJson(baseUrl, path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return body;
}

async function getJsonInProcess(app, path, headers = {}) {
  const chunks = [];
  const socket = new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' });

  const request = new http.IncomingMessage(socket);
  request.method = 'GET';
  request.url = path;
  request.headers = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );

  const response = new http.ServerResponse(request);
  response.shouldKeepAlive = false;
  response.assignSocket(socket);

  await new Promise((resolveRequest, reject) => {
    response.once('finish', resolveRequest);
    response.once('error', reject);
    socket.once('error', reject);
    app(request, response, reject);
  });

  const raw = Buffer.concat(chunks).toString('utf8');
  const bodyStart = raw.indexOf('\r\n\r\n');
  if (bodyStart === -1) throw new Error(`${path} returned a malformed HTTP response`);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${path} returned HTTP ${response.statusCode}`);
  }
  return JSON.parse(raw.slice(bodyStart + 4));
}

function restoreEnvironment(previousEnvironment) {
  for (const [name, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

export async function bootGoldenApp({ studentsDoc, inputs, configOverrides, inProcess = false }) {
  if (!studentsDoc || !Array.isArray(studentsDoc.students) || !studentsDoc.asOf) {
    throw new Error('Golden boot requires a students document with asOf and students[]');
  }
  if (!inputs || !inputs.answerKey || !inputs.productionGradeInputs) {
    throw new Error('Golden boot requires the frozen grade inputs document');
  }

  const previousDate = globalThis.Date;
  const previousEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    ROSTER_TOKEN_SECRET: process.env.ROSTER_TOKEN_SECRET,
    TEACHER_KEY: process.env.TEACHER_KEY,
  };
  let server = null;
  let restored = false;

  function restoreGlobals() {
    if (restored) return;
    restored = true;
    globalThis.Date = previousDate;
    restoreEnvironment(previousEnvironment);
  }

  globalThis.Date = fixedDateClass(studentsDoc.asOf, previousDate);
  process.env.NODE_ENV = 'test';
  process.env.ROSTER_TOKEN_SECRET = TOKEN_SECRET;
  process.env.TEACHER_KEY = TEACHER_KEY;

  try {
    const [{ createApp }, { signToken }] = await Promise.all([
      import('../../server.js'),
      import('../../token.js'),
    ]);
    const db = createFakeRosterDb(studentsDoc.students);
    const ledgerDb = createFakeLedgerDb(studentsDoc.students);
    const loadAnswerKey = async () => inputs.answerKey;
    const app = createApp(
      db,
      ledgerDb,
      undefined,
      loadAnswerKey,
      undefined,
      undefined,
      null,
      inputs.lessonSchedule,
      configOverrides,
      inputs.worksheetBlankCounts,
      null,
      null,
      null,
      null,
      inputs.worksheetKey,
      inputs.productionGradeInputs,
      null,
      null,
    );

    if (inProcess) {
      return {
        async getStudentGrade(studentId) {
          const token = signToken(studentId);
          return getJsonInProcess(app, '/grade', { authorization: `Bearer ${token}` });
        },

        async getClassGrades() {
          return getJsonInProcess(app, '/class/grades', { 'x-teacher-secret': TEACHER_KEY });
        },

        async close() {
          restoreGlobals();
        },
      };
    }

    server = http.createServer(app);
    await listen(server);
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    return {
      async getStudentGrade(studentId) {
        const token = signToken(studentId);
        return getJson(baseUrl, '/grade', { authorization: `Bearer ${token}` });
      },

      async getClassGrades() {
        return getJson(baseUrl, '/class/grades', { 'x-teacher-secret': TEACHER_KEY });
      },

      async close() {
        if (restored) return;
        try {
          if (server && server.listening) await closeServer(server);
        } finally {
          restoreGlobals();
        }
      },
    };
  } catch (error) {
    try {
      if (server && server.listening) await closeServer(server);
    } finally {
      restoreGlobals();
    }
    throw error;
  }
}
