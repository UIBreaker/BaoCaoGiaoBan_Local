const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { state } = require('./config.cjs');

const accountsFile = path.join(state, 'test-accounts.json');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format();

async function seed(pool) {
  if (!fs.existsSync(accountsFile)) {
    const accounts = [
      { username: 'lan.noi', department: 'noi', name: 'Khoa Nội (thử)', role: 'department' },
      { username: 'lan.nhi', department: 'nhi', name: 'Khoa Nhi (thử)', role: 'department' },
      { username: 'lan.khnv', department: 'khnv', name: 'Kế hoạch Nghiệp vụ (thử)', role: 'admin' },
    ].map(account => ({ ...account, password: randomBytes(18).toString('base64url') }));
    fs.writeFileSync(accountsFile, JSON.stringify({ date: today(), accounts }, null, 2), { flag: 'wx' });
  }

  const { date, accounts } = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const { username, password, department, name, role } of accounts) {
      await connection.execute(
        'INSERT INTO users (username, password_hash, department_code, department_name, role) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
        [username, await bcrypt.hash(password, 10), department, name, role],
      );
      if (role === 'admin') continue;

      const doctor = `Bác sĩ mô phỏng ${department.toUpperCase()}`;
      const nurse = `Điều dưỡng mô phỏng ${department.toUpperCase()}`;
      for (const [fullName, position] of [[doctor, 'Bác sĩ'], [nurse, 'Điều dưỡng']]) {
        await connection.execute(
          'INSERT INTO staff_members (full_name, position, department) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM staff_members WHERE department = ? AND full_name = ?)',
          [fullName, position, department, department, fullName],
        );
      }
      await connection.execute(
        'INSERT INTO reports (department_code, report_date, doctor_name, nurse_name, shift_time, report_data, status) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
        [department, date, doctor, nurse, 'Ca trực mô phỏng', '{}', department === 'noi' ? 'draft' : 'submitted'],
      );
    }
    await connection.commit();
    console.log(`Synthetic fixtures dated ${date}. Login details: ${accountsFile}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { seed, accountsFile };
