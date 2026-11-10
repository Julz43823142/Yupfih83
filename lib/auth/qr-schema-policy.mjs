// Only these three additive SQL statements are approved for the manual
// production QR-login migration. Do not reject ON DELETE CASCADE: it is
// a foreign-key clause, not a destructive standalone DML statement.
export function approvedQrSchema(sql) {
  if (typeof sql !== 'string') return false;
  const statements = sql.replace(/^\s*--[^\n]*/gm, '').split(';').map(x => x.trim()).filter(Boolean);
  return statements.length === 3 &&
    /^CREATE TABLE IF NOT EXISTS auth_qr_login\s*\(/i.test(statements[0]) &&
    /^CREATE INDEX IF NOT EXISTS auth_qr_login_expires_idx\s+ON\s+auth_qr_login\s*\(/i.test(statements[1]) &&
    /^CREATE UNIQUE INDEX IF NOT EXISTS auth_qr_login_session_once_idx\s+ON\s+auth_qr_login\s*\(/i.test(statements[2]) &&
    /\bapprovedSessionId\s+TEXT\b/i.test(statements[0]);
}
