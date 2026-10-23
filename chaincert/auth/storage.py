import sqlite3
from pathlib import Path
SCHEMA = '''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS institutions(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)));
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE COLLATE NOCASE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,totp_secret TEXT, email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN(0,1)),role TEXT NOT NULL CHECK(role IN('PLATFORM_ADMIN','INSTITUTION_ADMIN','ISSUER','STUDENT','PUBLIC_VERIFIER')),institution_id INTEGER REFERENCES institutions(id),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS login_attempts(
 id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, attempted_at INTEGER NOT NULL, success INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS one_time_tokens(
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN('EMAIL_VERIFY','PASSWORD_RESET')), expires_at INTEGER NOT NULL,
 used INTEGER NOT NULL DEFAULT 0 CHECK(used IN(0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions(token_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN(0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_user_id INTEGER REFERENCES users(id),action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,institution_id INTEGER,outcome TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
'''
class SQLiteStore:
 def __init__(self,path):
  self.path=str(path)
  if self.path != ":memory:": Path(self.path).expanduser().parent.mkdir(parents=True,exist_ok=True)
  with self.connect() as con:
   con.executescript(SCHEMA)
   columns = {r["name"] for r in con.execute("PRAGMA table_info(users)").fetchall()}
   if "totp_secret" not in columns: con.execute("ALTER TABLE users ADD COLUMN totp_secret TEXT")
   if "email_verified" not in columns: con.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
   if "roll_number" not in columns: con.execute("ALTER TABLE users ADD COLUMN roll_number TEXT")
 def connect(self):
  con=sqlite3.connect(self.path,timeout=10); con.row_factory=sqlite3.Row; con.execute("PRAGMA foreign_keys=ON"); return con
