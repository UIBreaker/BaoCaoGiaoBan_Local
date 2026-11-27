const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const mysql = require('mysql2/promise');
const trial = require('./config.cjs');
const { seed } = require('./seed.cjs');

const initialized = path.join(trial.state, 'initialized');
const [command = 'start', argument] = process.argv.slice(2);

function initialize(executable) {
  assert(executable && path.isAbsolute(executable), 'Supply the absolute path to MySQL 8.4 mysqld.exe.');
  assert.match(execFileSync(executable, ['--no-defaults', '--version'], { encoding: 'utf8' }), /8\.4\.\d+.*MySQL Community Server/);
  fs.mkdirSync(trial.state, { recursive: true });
  assert(!fs.existsSync(trial.data), 'The trial datadir already exists. Use start with the existing trial config.');
  const config = {
    executable,
    host: trial.host,
    port: trial.port,
    database: trial.database,
    user: 'lan_trial_app',
    password: randomBytes(32).toString('hex'),
    rootPassword: randomBytes(32).toString('hex'),
    jwtSecret: randomBytes(32).toString('hex'),
  };
  fs.writeFileSync(trial.configFile, JSON.stringify(config, null, 2), { flag: 'wx' });
  execFileSync(executable, [...mysqlArgs(config), '--initialize-insecure'], { stdio: 'inherit', windowsHide: true });
}

function mysqlArgs(config) {
  return [
    '--no-defaults',
    `--basedir=${path.dirname(path.dirname(config.executable))}`,
    `--datadir=${trial.data}`,
    `--tmpdir=${trial.state}`,
    `--bind-address=${trial.host}`,
    `--port=${trial.port}`,
    '--mysqlx=OFF',
    '--persisted-globals-load=OFF',
    '--local-infile=OFF',
    '--max-allowed-packet=64M',
    '--character-set-server=utf8mb4',
    '--collation-server=utf8mb4_unicode_ci',
    '--default-time-zone=+07:00',
    '--console',
  ];
}

async function provision(admin, config) {
  await admin.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [config.rootPassword]);
  // The repository SQL hard-codes the production-style schema name.
  const base = fs.readFileSync(path.join(trial.root, 'database', 'schema.sql'), 'utf8')
    .replace(/\bhospital_report\b/g, trial.database);
  for (const sql of [base, fs.readFileSync(path.join(__dirname, 'schema-extension.sql'), 'utf8')]) {
    for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) await admin.query(statement);
  }
  await admin.query("CREATE USER 'lan_trial_app'@'127.0.0.1' IDENTIFIED BY ?", [config.password]);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON \`${trial.database}\`.* TO 'lan_trial_app'@'127.0.0.1'`);
}

async function stop(config) {
  const admin = await mysql.createConnection(trial.settings(config, true));
  try {
    await trial.verify(admin);
    await admin.query('SHUTDOWN');
  } finally {
    await admin.end();
  }
}

async function startMysql(config) {
  const logPath = path.join(trial.state, 'mysql.log');
  const log = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn(config.executable, mysqlArgs(config), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise(resolve => {
    child.once('exit', resolve);
    child.once('error', resolve);
  });
  let output = '';
  let ready = false;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => {
      log.write(chunk);
      output = (output + chunk).slice(-8192);
      ready ||= /ready for connections[^\r\n]*port: 33317\b/i.test(output);
    });
  }
  try {
    for (let attempt = 0; attempt < 240 && !ready; attempt++) {
      const result = await Promise.race([exited.then(() => 'exited'), delay(250)]);
      assert.notEqual(result, 'exited', `MySQL did not start. See ${logPath}.`);
    }
    assert(ready && child.exitCode === null, `MySQL readiness not verified. See ${logPath}.`);
    child.once('close', () => log.end());
    return { child, exited };
  } catch (error) {
    if (child.exitCode === null) child.kill();
    log.end();
    throw error;
  }
}

async function main() {
  assert(['init', 'start', 'stop', 'check', 'seed'].includes(command), 'Use init <absolute mysqld path>, start [listen IP], stop, check, or seed.');
  // Reject inherited connection settings before initializing even an empty datadir.
  trial.rejectOverrides();
  if (command === 'init') initialize(argument);
  const config = trial.readConfig();
  if (command !== 'init') assert(fs.existsSync(initialized), 'Complete trial initialization first.');
  if (command === 'stop') return stop(config);
  if (command === 'check') return trial.enableApp(config);

  let pool;
  let web;
  let shutdown;
  let mysqlProcess;
  try {
    if (command !== 'seed') mysqlProcess = await startMysql(config);
    if (command === 'init') {
      const admin = await mysql.createConnection({ ...trial.settings(config, true), password: '' });
      try {
        await trial.verify(admin);
        await provision(admin, config);
      } finally {
        await admin.end();
      }
    }

    await trial.enableApp(config);
    pool = require('../server/src/config/db');
    if (command !== 'seed') await pool.ensureSchema();
    if (command === 'init' || command === 'seed') {
      await seed(pool);
      if (command === 'init') fs.writeFileSync(initialized, 'ready\n', { flag: 'wx' });
      return;
    }

    const ip = argument || trial.host;
    assert(net.isIPv4(ip), 'Supply an IPv4 interface address.');
    assert(fs.existsSync(path.join(trial.root, 'client', 'dist', 'index.html')), 'Build the LAN frontend first.');
    const app = require('../server/src/app');
    web = app.listen(trial.webPort, ip);
    await once(web, 'listening');
    console.log(`LAN web listening on ${ip}:${trial.webPort}.`);
    await Promise.race([
      new Promise(resolve => {
        shutdown = resolve;
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
      }),
      mysqlProcess.exited,
    ]);
  } finally {
    if (shutdown) {
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
    }
    if (web?.listening) await new Promise(resolve => web.close(resolve));
    if (pool) await pool.end();
    if (mysqlProcess && mysqlProcess.child.exitCode === null) {
      try {
        await stop(config);
        await mysqlProcess.exited;
      } catch (error) {
        mysqlProcess.child.kill();
        throw error;
      }
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = main;
