import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Driver, ManagedTransaction } from 'neo4j-driver';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { authWriteLock, plain, readTransaction, writeTransaction } from './db/connection.js';
import { HttpError } from './errors.js';

export const cookieName = 'coursegraph_session';
export const passwordSchema = z.string().min(10).max(128);
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,60}$/);

export interface PublicUser { id: string; username: string; displayName: string; role: 'ADMIN' | 'VIEWER'; active: boolean }
export interface StoredUser extends PublicUser { passwordHash: string; tokenVersion: number }
export interface AuthContext { user: PublicUser; csrfToken: string; tokenVersion: number }

declare module 'express-serve-static-core' {
  interface Request { auth?: AuthContext }
}

const publicUser = ({ id, username, displayName, role, active }: StoredUser): PublicUser => ({ id, username, displayName, role, active });

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, value) => error ? reject(error) : resolve(value)));
}

export async function hashPassword(password: string): Promise<string> {
  passwordSchema.parse(password);
  const salt = randomBytes(16).toString('hex');
  return `scrypt$16384$${salt}$${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (password.length > 128) return false;
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== '16384' || !/^[a-f0-9]{32}$/.test(parts[2]) || !/^[a-f0-9]{128}$/.test(parts[3])) return false;
  const actual = await derive(password, parts[2]);
  const expected = Buffer.from(parts[3], 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function assertOrigin(request: Request, config: AppConfig): void {
  const allowed = new Set([config.appOrigin]);
  if (config.mode === 'development') {
    allowed.add('http://127.0.0.1:5173');
    allowed.add('http://localhost:5173');
  }
  if (!allowed.has(request.get('origin') ?? '')) throw new HttpError(403, 'Nguồn yêu cầu không hợp lệ.');
}

export function requireMutation(request: Request, _response: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
  const csrf = request.get('x-csrf-token');
  const expected = request.auth?.csrfToken;
  const actualBytes = Buffer.from(csrf ?? '');
  const expectedBytes = Buffer.from(expected ?? '');
  if (!csrf || !expected || actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) throw new HttpError(403, 'Mã bảo vệ phiên không hợp lệ. Vui lòng tải lại trang.');
  next();
}

export function requireAdmin(request: Request, _response: Response, next: NextFunction): void {
  if (request.auth?.user.role !== 'ADMIN') throw new HttpError(403, 'Chức năng này yêu cầu quyền quản trị.');
  next();
}

export function authenticate(driver: Driver, config: AppConfig) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    const token: unknown = request.cookies?.[cookieName];
    if (typeof token !== 'string') throw new HttpError(401, 'Vui lòng đăng nhập.');
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(token, new TextEncoder().encode(config.jwtSecret), { issuer: 'coursegraph', audience: 'coursegraph-web', algorithms: ['HS256'] }));
    } catch { throw new HttpError(401, 'Phiên đăng nhập đã hết hạn.'); }
    if (typeof claims.sub !== 'string' || typeof claims.csrf !== 'string' || typeof claims.version !== 'number') throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.');
    const user = await readTransaction(driver, config.database, async (tx) => {
      const result = await tx.run('MATCH (u:AppUser {id:$id}) RETURN properties(u) AS user', { id: claims.sub });
      return result.records.length ? plain(result.records[0].get('user')) as StoredUser : null;
    });
    if (!user || !user.active || user.tokenVersion !== claims.version) throw new HttpError(401, 'Phiên đã bị thu hồi hoặc tài khoản bị khóa.');
    request.auth = { user: publicUser(user), csrfToken: claims.csrf, tokenVersion: claims.version };
    next();
  };
}

export async function login(driver: Driver, config: AppConfig, username: string, password: string, response: Response): Promise<{ user: PublicUser; csrfToken: string }> {
  const user = await readTransaction(driver, config.database, async (tx) => {
    const result = await tx.run('MATCH (u:AppUser {username:$username}) RETURN properties(u) AS user', { username });
    return result.records.length ? plain(result.records[0].get('user')) as StoredUser : null;
  });
  // A missing account still pays the password hashing cost.
  const valid = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password.length >= 10 ? password : `${password}not-a-real-password`), false);
  if (!user || !user.active || !valid) throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
  const csrfToken = randomBytes(24).toString('hex');
  const token = await new SignJWT({ version: user.tokenVersion, csrf: csrfToken })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuer('coursegraph').setAudience('coursegraph-web')
    .setIssuedAt().setExpirationTime(`${config.jwtTtlSeconds}s`).sign(new TextEncoder().encode(config.jwtSecret));
  response.cookie(cookieName, token, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/', maxAge: config.jwtTtlSeconds * 1000 });
  return { user: publicUser(user), csrfToken };
}

export function clearSession(response: Response, config: AppConfig): void {
  response.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/' });
}

export async function seedAdmin(driver: Driver, database: string, username: string, password: string): Promise<{ created: boolean; username: string }> {
  const normalizedUsername = usernameSchema.parse(username);
  const passwordHash = await hashPassword(password);
  return writeTransaction(driver, database, async (tx) => {
    await authWriteLock(tx);
    const existing = await tx.run('MATCH (u:AppUser {username:$username}) RETURN u.id AS id', { username: normalizedUsername });
    if (existing.records.length) return { created: false, username: normalizedUsername };
    await tx.run("CREATE (:AppUser {id:$id,username:$username,displayName:'Quản trị viên',role:'ADMIN',active:true,passwordHash:$passwordHash,tokenVersion:0,createdAt:$createdAt})", { id: randomUUID(), username: normalizedUsername, passwordHash, createdAt: new Date().toISOString() });
    return { created: true, username: normalizedUsername };
  });
}

export async function protectLastAdmin(tx: ManagedTransaction, id: string, replacement: { active?: boolean; role?: string }): Promise<StoredUser> {
  const result = await tx.run('MATCH (u:AppUser {id:$id}) RETURN properties(u) AS user', { id });
  if (!result.records.length) throw new HttpError(404, 'Không tìm thấy tài khoản.');
  const user = plain(result.records[0].get('user')) as StoredUser;
  if (user.active && user.role === 'ADMIN' && (replacement.active === false || replacement.role === 'VIEWER')) {
    const admins = await tx.run("MATCH (u:AppUser {active:true,role:'ADMIN'}) RETURN count(u) AS count");
    if (Number(plain(admins.records[0].get('count'))) <= 1) throw new HttpError(409, 'Phải giữ ít nhất một quản trị viên đang hoạt động.');
  }
  return user;
}
