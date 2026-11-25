const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const state = path.join(root, '.lan-trial');
const data = path.join(state, 'mysql-data');
const configFile = path.join(state, 'config.json');
const host = '127.0.0.1';
const port = 33317;
const database = 'hospital_report_lan_trial';
const webPort = 3017;
let verifiedPoolOptions;

function rejectOverrides() {
  for (const key of ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL', 'JWT_SECRET', 'SMTP_USER', 'SMTP_PASS', 'VERCEL']) {
    assert(!(key in process.env), `Unset ${key} before using the LAN checkout.`);
  }
}

function readConfig() {
  rejectOverrides();
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert(config.host === host && config.port === port && config.database === database && config.user === 'lan_trial_app',
    'The configuration is outside the dedicated trial target.');
  assert(['password', 'rootPassword', 'jwtSecret'].every(key => typeof config[key] === 'string' && /^[0-9a-f]{64}$/.test(config[key])),
    'Missing or invalid trial credentials.');
  return config;
}

function settings(config, admin = false) {
  return {
    host,
    port,
    user: admin ? 'root' : config.user,
    password: admin ? config.rootPassword : config.password,
    database: admin ? undefined : database,
    charset: 'utf8mb4',
    timezone: '+07:00',
    dateStrings: true,
    connectTimeout: 3000,
  };
}

async function verify(connection) {
  const uuid = fs.readFileSync(path.join(data, 'auto.cnf'), 'utf8').match(/^server-uuid\s*=\s*([a-f0-9-]{36})\s*$/mi)?.[1];
  assert(uuid, 'Missing server UUID in trial datadir.');
  const [[server]] = await connection.query(
    'SELECT @@server_uuid AS uuid, @@datadir AS directory, @@port AS port, @@bind_address AS address, DATABASE() AS db',
  );
  assert.equal(server.uuid, uuid, 'Wrong MySQL instance.');
  assert.equal(fs.realpathSync(server.directory), fs.realpathSync(data), 'Wrong MySQL datadir.');
  assert.equal(server.port, port);
  assert.equal(server.address, host);
  assert(server.db === null || server.db === database);
  return server;
}

async function enableApp(config) {
  const options = settings(config);
  const connection = await require('mysql2/promise').createConnection(options);
  try {
    const server = await verify(connection);
    assert.equal(server.db, database);
  } finally {
    await connection.end();
  }
  verifiedPoolOptions = options;
  process.env.JWT_SECRET = config.jwtSecret;
  console.log(`Verified MySQL ${host}:${port}/${database} and dedicated datadir.`);
}

function poolOptions() {
  assert(verifiedPoolOptions, 'Run node lan-trial/run.cjs after initializing the isolated MySQL instance.');
  return verifiedPoolOptions;
}

module.exports = { root, state, data, configFile, host, port, database, webPort, rejectOverrides, readConfig, settings, verify, enableApp, poolOptions };
