import json, secrets, time, hashlib, hmac
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from .models import Role, Permission, User
from .passwords import hash_password, verify_password
from .policy import has_permission
from .storage import SQLiteStore
import base64, struct, urllib.parse

class AccessDenied(PermissionError): pass
class AuthenticationError(ValueError): pass

class AccessControlService:
 def __init__(self,database_path:str,token_secret:str,token_max_age_seconds:int=3600, max_login_attempts:int=5, login_window_seconds:int=300):
  if not token_secret or len(token_secret)<32: raise ValueError("token_secret must be at least 32 characters")
  self.store=SQLiteStore(database_path); self.serializer=URLSafeTimedSerializer(token_secret,salt="chaincert-standalone-module6")
  self.max_age=token_max_age_seconds; self.max_login_attempts=max_login_attempts; self.login_window_seconds=login_window_seconds
 def create_institution(self,name:str)->int:
  if not isinstance(name,str) or not name.strip(): raise ValueError("Institution name required")
  with self.store.connect() as c: return int(c.execute("INSERT INTO institutions(name) VALUES(?)",(name.strip(),)).lastrowid)
 def provision_user(self,*,email,display_name,password,role:Role,institution_id=None,actor:User|None=None,roll_number:str|None=None)->int:
  if not isinstance(email,str) or "@" not in email or len(email)>254: raise ValueError("Valid email required")
  if not isinstance(display_name,str) or not display_name.strip(): raise ValueError("Display name required")
  if not isinstance(role,Role): raise ValueError("role must be Role enum")
  with self.store.connect() as c:
   count=c.execute("SELECT COUNT(*) n FROM users").fetchone()["n"]
   if actor is None and count: raise AccessDenied("Unauthenticated provisioning only allowed for initial bootstrap")
   if actor:
    self._active(c,actor)
    if actor.role==Role.PLATFORM_ADMIN: pass
    elif actor.role==Role.INSTITUTION_ADMIN:
     if role not in {Role.ISSUER,Role.STUDENT,Role.PUBLIC_VERIFIER}: raise AccessDenied("Institution admin cannot provision this role")
     if actor.institution_id is None or institution_id!=actor.institution_id: raise AccessDenied("Institution boundary violation")
    else: raise AccessDenied("Insufficient role to provision users")
   if role==Role.PLATFORM_ADMIN and institution_id is not None: raise ValueError("PLATFORM_ADMIN cannot be institution-bound")
   if role not in {Role.PLATFORM_ADMIN,Role.PUBLIC_VERIFIER} and institution_id is None: raise ValueError("This role requires institution_id")
   if institution_id is not None:
    inst=c.execute("SELECT active FROM institutions WHERE id=?",(institution_id,)).fetchone()
    if not inst or not inst["active"]: raise ValueError("Institution missing or inactive")
   cols = {r["name"] for r in c.execute("PRAGMA table_info(users)").fetchall()}
   if "roll_number" in cols:
    cur=c.execute("INSERT INTO users(email,display_name,password_hash,role,institution_id,roll_number) VALUES(?,?,?,?,?,?)",
     (email.strip().lower(),display_name.strip(),hash_password(password),role.value,institution_id,roll_number.strip() if roll_number else None))
   else:
    cur=c.execute("INSERT INTO users(email,display_name,password_hash,role,institution_id) VALUES(?,?,?,?,?)",
     (email.strip().lower(),display_name.strip(),hash_password(password),role.value,institution_id))
   uid=int(cur.lastrowid); self._audit(c,actor.id if actor else None,"USER_PROVISIONED","user",str(uid),institution_id,"SUCCESS",{"role":role.value})
   return uid
 @staticmethod
 def _totp_code(secret: str, timestamp: int | None = None) -> str:
  now=int(time.time()) if timestamp is None else int(timestamp)
  key=base64.b32decode(secret.upper()+"="*((8-len(secret)%8)%8))
  counter=now//30
  digest=hmac.new(key,struct.pack(">Q",counter),hashlib.sha1).digest()
  offset=digest[-1]&0x0f
  number=(struct.unpack(">I",digest[offset:offset+4])[0]&0x7fffffff)%1000000
  return f"{number:06d}"

 @classmethod
 def _verify_totp(cls, secret: str, code: str) -> bool:
  if not isinstance(code,str) or len(code)!=6 or not code.isdigit(): return False
  now=int(time.time())
  return any(hmac.compare_digest(cls._totp_code(secret,now+step*30),code) for step in (-1,0,1))

 def begin_mfa_enrollment(self, user: User) -> str:
  """Create a TOTP secret. Display the returned secret/otpauth URI securely to the user."""
  with self.store.connect() as c:
   self._active(c,user)
   secret=base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
   c.execute("UPDATE users SET totp_secret=? WHERE id=?",(secret,user.id))
   self._audit(c,user.id,"MFA_ENROLLMENT_STARTED","user",str(user.id),user.institution_id,"SUCCESS",{})
   label=urllib.parse.quote("ChainCert Standalone:" + user.email)
  issuer=urllib.parse.quote("ChainCert Standalone")
  return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"

 def confirm_mfa_enrollment(self, user: User, code: str) -> bool:
  with self.store.connect() as c:
   self._active(c,user)
   row=c.execute("SELECT totp_secret FROM users WHERE id=?",(user.id,)).fetchone()
   ok=bool(row["totp_secret"] and self._verify_totp(row["totp_secret"], str(code)))
   self._audit(c,user.id,"MFA_ENROLLMENT_CONFIRMED","user",str(user.id),user.institution_id,"SUCCESS" if ok else "FAILURE",{})
   return ok

 def _rate_limited(self, con, email: str, now: int) -> bool:
  con.execute("DELETE FROM login_attempts WHERE attempted_at < ?",(now-self.login_window_seconds,))
  row=con.execute("SELECT COUNT(*) n FROM login_attempts WHERE email=? COLLATE NOCASE AND success=0 AND attempted_at>=?",(email,now-self.login_window_seconds)).fetchone()
  return row["n"] >= self.max_login_attempts

 def _record_login_attempt(self, con, email: str, now: int, success: bool):
  con.execute("INSERT INTO login_attempts(email,attempted_at,success) VALUES(?,?,?)",(email,now,int(success)))

 def issue_email_verification(self, email: str) -> str:
  """Issue a one-time verification token. Deliver it out-of-band; this service sends no email."""
  with self.store.connect() as c:
   row=c.execute("SELECT id FROM users WHERE email=? COLLATE NOCASE",(email,)).fetchone()
   if not row: raise ValueError("User not found")
   return self._issue_one_time_token(c,row["id"],"EMAIL_VERIFY",3600)

 def verify_email(self, token: str) -> bool:
  with self.store.connect() as c:
   row=self._consume_one_time_token(c,token,"EMAIL_VERIFY")
   if not row: return False
   c.execute("UPDATE users SET email_verified=1 WHERE id=?",(row["user_id"],))
   self._audit(c,row["user_id"],"EMAIL_VERIFIED","user",str(row["user_id"]),None,"SUCCESS",{})
   return True

 def request_password_reset(self, email: str) -> str | None:
  """Return a one-time reset token for out-of-band delivery; caller should avoid account enumeration."""
  with self.store.connect() as c:
   row=c.execute("SELECT id FROM users WHERE email=? COLLATE NOCASE",(email,)).fetchone()
   if not row: return None
   token=self._issue_one_time_token(c,row["id"],"PASSWORD_RESET",1800)
   self._audit(c,row["id"],"PASSWORD_RESET_REQUESTED","user",str(row["id"]),None,"SUCCESS",{})
   return token

 def reset_password(self, token: str, new_password: str) -> bool:
  new_hash=hash_password(new_password)
  with self.store.connect() as c:
   row=self._consume_one_time_token(c,token,"PASSWORD_RESET")
   if not row: return False
   c.execute("UPDATE users SET password_hash=? WHERE id=?",(new_hash,row["user_id"]))
   c.execute("UPDATE sessions SET revoked=1 WHERE user_id=?",(row["user_id"],))
   self._audit(c,row["user_id"],"PASSWORD_RESET_COMPLETED","user",str(row["user_id"]),None,"SUCCESS",{})
   return True

 def _issue_one_time_token(self, con, user_id: int, purpose: str, lifetime: int) -> str:
  token=secrets.token_urlsafe(32)
  digest=hashlib.sha256(token.encode()).hexdigest()
  con.execute("INSERT INTO one_time_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,?,?)",
              (digest,user_id,purpose,int(time.time())+lifetime))
  return token

 def _consume_one_time_token(self, con, token: str, purpose: str):
  if not isinstance(token,str): return None
  digest=hashlib.sha256(token.encode()).hexdigest()
  row=con.execute("SELECT * FROM one_time_tokens WHERE token_hash=? AND purpose=? AND used=0 AND expires_at>=?",
                  (digest,purpose,int(time.time()))).fetchone()
  if row:
   con.execute("UPDATE one_time_tokens SET used=1 WHERE token_hash=?",(digest,))
  return row

 def rotate_session(self, token: str) -> str:
  """Rotate a live session token and revoke the previous session."""
  user=self.authenticate(token)
  payload=self.serializer.loads(token,max_age=self.max_age)
  with self.store.connect() as c:
   c.execute("UPDATE sessions SET revoked=1 WHERE token_id=?",(payload["sid"],))
   sid=secrets.token_urlsafe(24); exp=int(time.time())+self.max_age
   c.execute("INSERT INTO sessions(token_id,user_id,expires_at) VALUES(?,?,?)",(sid,user.id,exp))
   self._audit(c,user.id,"SESSION_ROTATED","user",str(user.id),user.institution_id,"SUCCESS",{})
   return self.serializer.dumps({"sid":sid,"uid":user.id,"exp":exp})

 def login(self,email,password, mfa_code: str | None = None)->str:
  now=int(time.time())
  with self.store.connect() as c:
   normalized_email = email.strip().lower() if isinstance(email,str) else ""
   if self._rate_limited(c, normalized_email, now):
    self._audit(c,None,"LOGIN_RATE_LIMITED","user",normalized_email,None,"DENIED",{})
    c.commit()
    raise AuthenticationError("Too many failed login attempts; try again later")
   row=c.execute("SELECT * FROM users WHERE email=? COLLATE NOCASE",(email,)).fetchone()
   password_ok = bool(row and row["active"] and verify_password(password,row["password_hash"]))
   mfa_ok = bool(row and (not row["totp_secret"] or (mfa_code and self._verify_totp(row["totp_secret"], str(mfa_code)))))
   if not password_ok or not mfa_ok:
    self._record_login_attempt(c, normalized_email, now, False)
    self._audit(c,row["id"] if row else None,"LOGIN","user",str(row["id"]) if row else None,row["institution_id"] if row else None,"FAILURE",{"reason":"invalid credentials, MFA, or inactive account"})
    c.commit()  # Preserve failed-attempt counters and audit record despite raising below.
    raise AuthenticationError("Invalid credentials, MFA code, or inactive account")
   self._record_login_attempt(c, normalized_email, now, True)
   sid=secrets.token_urlsafe(24); exp=int(time.time())+self.max_age
   c.execute("INSERT INTO sessions(token_id,user_id,expires_at) VALUES(?,?,?)",(sid,row["id"],exp))
   token=self.serializer.dumps({"sid":sid,"uid":row["id"],"exp":exp})
   self._audit(c,row["id"],"LOGIN","user",str(row["id"]),row["institution_id"],"SUCCESS",{})
   return token
 def authenticate(self,token:str)->User:
  try: payload=self.serializer.loads(token,max_age=self.max_age)
  except (BadSignature,SignatureExpired): raise AuthenticationError("Invalid or expired token") from None
  with self.store.connect() as c:
   cols = {r["name"] for r in c.execute("PRAGMA table_info(users)").fetchall()}
   has_roll = "roll_number" in cols
   query = ("SELECT s.token_id,s.user_id,s.expires_at,s.revoked,u.id,u.email,u.display_name,u.role,u.institution_id,u.active"
            + (",u.roll_number" if has_roll else "")
            + " FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_id=? AND s.user_id=?")
   row=c.execute(query,(payload.get("sid"),payload.get("uid"))).fetchone()
   if not row or row["revoked"] or row["expires_at"]<int(time.time()): raise AuthenticationError("Session invalid, expired, or logged out")
   if not row["active"]: raise AuthenticationError("Account inactive")
   roll = row["roll_number"] if has_roll and "roll_number" in row.keys() else None
   return User(row["id"],row["email"],row["display_name"],Role(row["role"]),row["institution_id"],bool(row["active"]),roll)
 def logout(self,token):
  user=self.authenticate(token); payload=self.serializer.loads(token,max_age=self.max_age)
  with self.store.connect() as c:
   c.execute("UPDATE sessions SET revoked=1 WHERE token_id=?",(payload["sid"],))
   self._audit(c,user.id,"LOGOUT","user",str(user.id),user.institution_id,"SUCCESS",{})
 def authorize(self,user:User,permission:Permission,*,target_institution_id=None)->bool:
  with self.store.connect() as c:
   self._active(c,user)
   if not has_permission(user.role,permission):
    self._audit(c,user.id,"AUTHORIZE","permission",permission.value,user.institution_id,"DENIED",{"reason":"role lacks permission"})
    raise AccessDenied(f"Role {user.role.value} cannot perform {permission.value}")
   if user.role!=Role.PLATFORM_ADMIN and target_institution_id is not None and user.institution_id!=target_institution_id:
    self._audit(c,user.id,"AUTHORIZE","institution",str(target_institution_id),user.institution_id,"DENIED",{"reason":"institution boundary"})
    raise AccessDenied("Institution boundary violation")
   self._audit(c,user.id,"AUTHORIZE","permission",permission.value,target_institution_id if target_institution_id is not None else user.institution_id,"SUCCESS",{})
   return True
 def deactivate_user(self,actor:User,user_id:int):
  with self.store.connect() as c:
   self._active(c,actor); target=c.execute("SELECT * FROM users WHERE id=?",(user_id,)).fetchone()
   if not target: raise ValueError("User not found")
   if not (actor.role==Role.PLATFORM_ADMIN or (actor.role==Role.INSTITUTION_ADMIN and actor.institution_id==target["institution_id"])):
    raise AccessDenied("Insufficient role or institution scope")
   c.execute("UPDATE users SET active=0 WHERE id=?",(user_id,)); c.execute("UPDATE sessions SET revoked=1 WHERE user_id=?",(user_id,))
   self._audit(c,actor.id,"USER_DEACTIVATED","user",str(user_id),target["institution_id"],"SUCCESS",{})
 def change_role(self,actor:User,user_id:int,new_role:Role,new_institution_id=None):
  if not isinstance(new_role,Role): raise ValueError("new_role must be Role enum")
  with self.store.connect() as c:
   self._active(c,actor); target=c.execute("SELECT * FROM users WHERE id=?",(user_id,)).fetchone()
   if not target: raise ValueError("User not found")
   if actor.role!=Role.PLATFORM_ADMIN: raise AccessDenied("Only PLATFORM_ADMIN can change roles")
   if new_role==Role.PLATFORM_ADMIN and new_institution_id is not None: raise ValueError("PLATFORM_ADMIN cannot be institution-bound")
   if new_role not in {Role.PLATFORM_ADMIN,Role.PUBLIC_VERIFIER} and new_institution_id is None: raise ValueError("This role requires institution")
   if new_institution_id is not None:
    inst=c.execute("SELECT active FROM institutions WHERE id=?",(new_institution_id,)).fetchone()
    if not inst or not inst["active"]: raise ValueError("Institution missing or inactive")
   c.execute("UPDATE users SET role=?,institution_id=? WHERE id=?",(new_role.value,new_institution_id,user_id))
   c.execute("UPDATE sessions SET revoked=1 WHERE user_id=?",(user_id,))
   self._audit(c,actor.id,"ROLE_CHANGED","user",str(user_id),new_institution_id,"SUCCESS",{"old_role":target["role"],"new_role":new_role.value})
 def list_audit_log(self,actor:User,limit=100):
  if actor.role!=Role.PLATFORM_ADMIN: raise AccessDenied("Only PLATFORM_ADMIN can read full audit log")
  with self.store.connect() as c:
   self._active(c,actor); rows=c.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?",(max(1,min(int(limit),500)),)).fetchall()
   return [dict(r) for r in rows]
 @staticmethod
 def _active(c,actor):
  row=c.execute("SELECT active,role,institution_id FROM users WHERE id=?",(actor.id,)).fetchone()
  if not row or not row["active"]: raise AccessDenied("Actor missing or inactive")
  if row["role"]!=actor.role.value or row["institution_id"]!=actor.institution_id: raise AccessDenied("Actor identity stale; authenticate again")
 @staticmethod
 def _audit(c,actor_id,action,target_type,target_id,institution_id,outcome,details):
  c.execute("INSERT INTO audit_log(actor_user_id,action,target_type,target_id,institution_id,outcome,details) VALUES(?,?,?,?,?,?,?)",
   (actor_id,action,target_type,target_id,institution_id,outcome,json.dumps(details,sort_keys=True,separators=(",",":"))))
