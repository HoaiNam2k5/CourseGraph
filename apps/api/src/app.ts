import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import neo4j, { type Driver } from 'neo4j-driver';
import { z } from 'zod';
import { stringify } from 'csv-stringify/sync';
import { businessLabels, entityByLabel, entityBySlug, entityDefinitions, relationshipDefinitions } from '../../../packages/shared/src/catalog.js';
import { DataValidationError, validateBusinessData } from '../../../packages/shared/src/data.js';
import { type AppConfig, loadConfig } from './config.js';
import { authenticate, assertOrigin, clearSession, cookieName, hashPassword, login, passwordSchema, protectLastAdmin, requireAdmin, requireMutation, usernameSchema, verifyPassword, type StoredUser } from './auth.js';
import { authWriteLock, createDriver, plain, readTransaction, writeTransaction } from './db/connection.js';
import { exportBusinessData, importBusinessData } from './db/business.js';
import { HttpError } from './errors.js';
import { createEntity, deleteEntity, entityDetail, listEntities, mutateRelationship, replaceRelationship, updateCompletions, updateEntity } from './entities.js';
import { listRelationships, relationshipQuery } from './relationships.js';
import { courseNetwork, recommendCourses, shortestCoursePath, statistics } from './domain.js';
import { createImportPreview, parseCsvImport } from './transfers.js';

const credentialsSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) }).strict();
const relationSchema = z.object({ fromLabel: z.string(), fromId: z.string().min(1).max(80), type: z.string(), toLabel: z.string(), toId: z.string().min(1).max(80) }).strict();
const idSchema = z.string().min(1).max(80);
const propertiesSchema = z.object({ properties: z.record(z.string(), z.unknown()) }).strict();

function safeUser(value: StoredUser) {
  const { id, username, displayName, role, active } = value;
  return { id, username, displayName, role, active };
}

export function createApp(options: { config?: AppConfig; driver?: Driver } = {}) {
  const config = options.config ?? loadConfig();
  const driver = options.driver ?? createDriver(config);
  const app = express();
  app.locals.driver = driver;
  app.locals.config = config;
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': config.cookieSecure ? [] : null } } }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use((request, response, next) => { const requestId = randomUUID(); response.locals.requestId = requestId; response.setHeader('X-Request-Id', requestId); next(); });
  const api = express.Router();
  app.use('/api', api);

  api.get('/health/live', (_request, response) => { response.json({ status: 'ok', service: 'coursegraph' }); });
  api.get('/health/ready', async (_request, response) => {
    await readTransaction(driver, config.database, async (tx) => { await tx.run('RETURN 1 AS ready'); });
    response.json({ status: 'ready', database: config.database });
  });

  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => config.mode === 'test', message: { error: 'Đã vượt số lần đăng nhập. Vui lòng thử lại sau.' } });
  api.post('/auth/login', loginLimit, async (request, response) => {
    assertOrigin(request, config);
    const input = credentialsSchema.parse(request.body);
    response.json(await login(driver, config, input.username, input.password, response));
  });

  api.use(authenticate(driver, config));
  api.use((request, _response, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) assertOrigin(request, config);
    next();
  });
  api.use(requireMutation);
  api.get('/auth/me', (request, response) => { response.json({ user: request.auth!.user, csrfToken: request.auth!.csrfToken }); });
  api.post('/auth/logout', async (request, response) => {
    await writeTransaction(driver, config.database, async (tx) => { await tx.run('MATCH (u:AppUser {id:$id}) SET u.tokenVersion=u.tokenVersion+1', { id: request.auth!.user.id }); });
    clearSession(response, config);
    response.json({ loggedOut: true });
  });
  api.post('/auth/change-password', async (request, response) => {
    const input = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict().parse(request.body);
    const passwordHash = await hashPassword(input.newPassword);
    await writeTransaction(driver, config.database, async (tx) => {
      await authWriteLock(tx);
      const result = await tx.run('MATCH (u:AppUser {id:$id}) RETURN properties(u) AS user', { id: request.auth!.user.id });
      const user = plain(result.records[0].get('user')) as StoredUser;
      if (!await verifyPassword(input.currentPassword, user.passwordHash)) throw new HttpError(400, 'Mật khẩu hiện tại không đúng.');
      await tx.run('MATCH (u:AppUser {id:$id}) SET u.passwordHash=$passwordHash,u.tokenVersion=u.tokenVersion+1', { id: user.id, passwordHash });
    });
    clearSession(response, config);
    response.json({ changed: true, requiresLogin: true });
  });

  api.get('/catalog', (_request, response) => { response.json({ entities: entityDefinitions, relationships: relationshipDefinitions }); });
  api.get('/system/connection', requireAdmin, async (_request, response) => {
    await readTransaction(driver, config.database, async (tx) => { await tx.run('RETURN 1 AS ready'); });
    const uri = new URL(config.neo4jUri);
    uri.username = ''; uri.password = ''; uri.search = ''; uri.hash = '';
    response.json({ database: config.database, uri: uri.toString(), browserUrl: config.neo4jBrowserUrl ?? null, deployment: config.neo4jDeployment, checkedAt: new Date().toISOString() });
  });
  api.get('/users', requireAdmin, async (_request, response) => {
    const items = await readTransaction(driver, config.database, async (tx) => {
      const result = await tx.run('MATCH (u:AppUser) RETURN properties(u) AS user ORDER BY u.username');
      return result.records.map((record) => safeUser(plain(record.get('user')) as StoredUser));
    });
    response.json({ items });
  });
  api.post('/users', requireAdmin, async (request, response) => {
    const input = z.object({ username: usernameSchema, password: passwordSchema, displayName: z.string().trim().min(1).max(120), role: z.enum(['ADMIN', 'VIEWER']), active: z.boolean().default(true) }).strict().parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const user = await writeTransaction(driver, config.database, async (tx) => {
      await authWriteLock(tx);
      const existing = await tx.run('MATCH (u:AppUser {username:$username}) RETURN u.id', { username: input.username });
      if (existing.records.length) throw new HttpError(409, 'Tên đăng nhập đã tồn tại.');
      const data = { id: randomUUID(), username: input.username, displayName: input.displayName, role: input.role, active: input.active, passwordHash, tokenVersion: 0, createdAt: new Date().toISOString() };
      await tx.run('CREATE (u:AppUser) SET u=$user', { user: data });
      return safeUser(data);
    });
    response.status(201).json(user);
  });
  api.patch('/users/:id', requireAdmin, async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = z.object({ displayName: z.string().trim().min(1).max(120).optional(), role: z.enum(['ADMIN', 'VIEWER']).optional(), active: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0).parse(request.body);
    const user = await writeTransaction(driver, config.database, async (tx) => {
      await authWriteLock(tx);
      await protectLastAdmin(tx, id, input);
      const result = await tx.run('MATCH (u:AppUser {id:$id}) SET u+=$properties,u.tokenVersion=u.tokenVersion+1 RETURN properties(u) AS user', { id, properties: input });
      return safeUser(plain(result.records[0].get('user')) as StoredUser);
    });
    response.json(user);
  });
  api.post('/users/:id/reset-password', requireAdmin, async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = z.object({ password: passwordSchema }).strict().parse(request.body);
    const passwordHash = await hashPassword(input.password);
    await writeTransaction(driver, config.database, async (tx) => {
      await authWriteLock(tx);
      await protectLastAdmin(tx, id, {});
      await tx.run('MATCH (u:AppUser {id:$id}) SET u.passwordHash=$passwordHash,u.tokenVersion=u.tokenVersion+1', { id, passwordHash });
    });
    response.json({ reset: true });
  });

  api.get('/graph', async (request, response) => {
    const query = z.object({ courseId: idSchema.optional(), depth: z.coerce.number().int().min(1).max(6).default(2) }).parse(request.query);
    response.json(courseNetwork(await exportBusinessData(driver, config.database), query.courseId, query.depth));
  });
  api.get('/paths', async (request, response) => {
    const query = z.object({ from: idSchema, to: idSchema }).parse(request.query);
    response.json(shortestCoursePath(await exportBusinessData(driver, config.database), query.from, query.to));
  });
  api.get('/statistics', async (_request, response) => { response.json(statistics(await exportBusinessData(driver, config.database))); });
  api.get('/students/:id/recommendations', async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const filters = z.object({ programId: idSchema.optional(), semesterId: idSchema.optional() }).parse(request.query);
    response.json(recommendCourses(await exportBusinessData(driver, config.database), id, filters));
  });
  api.put('/students/:id/completions', requireAdmin, async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const input = z.object({ courseIds: z.array(idSchema).max(1000) }).strict().parse(request.body);
    response.json(await updateCompletions(driver, config.database, id, input.courseIds));
  });
  api.get('/courses/:id/prerequisites', async (request, response) => { const detail = await entityDetail(driver, config.database, entityBySlug('courses')!, idSchema.parse(request.params.id)); response.json({ items: detail.prerequisites }); });
  api.get('/courses/:id/dependents', async (request, response) => { const detail = await entityDetail(driver, config.database, entityBySlug('courses')!, idSchema.parse(request.params.id)); response.json({ items: detail.dependents }); });
  api.get('/relationships', async (request, response) => {
    const query = relationshipQuery.parse(request.query);
    response.json(await listRelationships(driver, config.database, query));
  });
  for (const method of ['post', 'delete'] as const) {
    api[method]('/prerequisites', requireAdmin, async (request, response) => {
      const input = z.object({ fromId: idSchema, toId: idSchema }).strict().parse(request.body);
      response.status(method === 'post' ? 201 : 200).json(await mutateRelationship(driver, config.database, { ...input, fromLabel: 'MonHoc', toLabel: 'MonHoc', type: 'TIEN_QUYET_CHO' }, method === 'delete'));
    });
    api[method]('/relationships', requireAdmin, async (request, response) => {
      const input = relationSchema.parse(request.body);
      response.status(method === 'post' ? 201 : 200).json(await mutateRelationship(driver, config.database, input, method === 'delete'));
    });
  }

  api.patch('/relationships', requireAdmin, async (request, response) => {
    const { previous, next } = z.object({ previous: relationSchema, next: relationSchema }).strict().parse(request.body);
    response.json(await replaceRelationship(driver, config.database, previous, next));
  });

  api.post('/imports/preview', requireAdmin, async (request, response) => {
    const body = z.object({ data: z.unknown() }).strict().parse(request.body);
    const data = validateBusinessData(body.data);
    response.json(await createImportPreview(driver, config.database, data, request.auth!.user.id));
  });
  api.post('/imports/csv/preview', requireAdmin, async (request, response) => {
    const { data, audit } = await parseCsvImport(request.body);
    const warnings = [`Đã loại ${audit.duplicateNodes} dòng node và ${audit.duplicateRelationships} dòng quan hệ trùng.`, `${audit.warnings.historicalPrerequisiteCount} cảnh báo lịch sử thiếu tiên quyết; dữ liệu được giữ để đối chiếu.`];
    response.json(await createImportPreview(driver, config.database, data, request.auth!.user.id, warnings));
  });
  api.post('/imports/:id/commit', requireAdmin, async (request, response) => {
    const id = idSchema.parse(request.params.id);
    const preview = await readTransaction(driver, config.database, async (tx) => {
      const result = await tx.run('MATCH (p:AppImport {id:$id,userId:$userId}) RETURN properties(p) AS preview', { id, userId: request.auth!.user.id });
      return result.records.length ? plain(result.records[0].get('preview')) as { dataJson?: string; resultJson?: string } : null;
    });
    if (!preview) throw new HttpError(404, 'Không tìm thấy bản xem trước.');
    if (preview.resultJson) return response.json(JSON.parse(preview.resultJson) as unknown);
    if (!preview.dataJson) throw new HttpError(409, 'Bản xem trước không còn nội dung.');
    const data = validateBusinessData(JSON.parse(preview.dataJson) as unknown);
    response.json(await importBusinessData(driver, config.database, data, request.auth!.user.username, { id, userId: request.auth!.user.id }));
  });
  api.get('/exports/business-data', requireAdmin, async (request, response) => {
    const data = await exportBusinessData(driver, config.database);
    await writeTransaction(driver, config.database, async (tx) => { await tx.run("CREATE (:AppTransfer {id:randomUUID(),kind:'EXPORT',username:$username,createdAt:$createdAt,nodeCount:$nodes,relationshipCount:$relationships})", { username: request.auth!.user.username, createdAt: new Date().toISOString(), nodes: neo4j.int(data.nodes.length), relationships: neo4j.int(data.relationships.length) }); });
    response.attachment('coursegraph-business-data.json').json(data);
  });
  api.get('/exports/csv', requireAdmin, async (request, response) => {
    const label = z.string().parse(request.query.label);
    const data = await exportBusinessData(driver, config.database);
    if (label === 'relationships') {
      const rows = data.relationships.map((edge) => ({ NhanNguon: `[${edge.fromLabel}]`, MaNguon: edge.fromId, LoaiQuanHe: edge.type, NhanDich: `[${edge.toLabel}]`, MaDich: edge.toId }));
      return response.attachment('QuanHeLienKet.csv').type('text/csv').send(stringify(rows, { header: true, bom: true, columns: ['NhanNguon', 'MaNguon', 'LoaiQuanHe', 'NhanDich', 'MaDich'] }));
    }
    const definition = entityByLabel(label);
    if (!definition) throw new HttpError(400, 'Nhãn dữ liệu không hợp lệ.');
    response.attachment(definition.file).type('text/csv').send(stringify(data.nodes.filter((node) => node.label === definition.label).map((node) => node.properties), { header: true, bom: true, columns: definition.fields.map((field) => field.key) }));
  });
  api.get('/transfers/history', requireAdmin, async (_request, response) => {
    const items = await readTransaction(driver, config.database, async (tx) => {
      const result = await tx.run('MATCH (t:AppTransfer) RETURN properties(t) AS transfer ORDER BY t.createdAt DESC LIMIT 50');
      return result.records.map((record) => plain(record.get('transfer')));
    });
    response.json({ items });
  });

  api.get('/:slug', async (request, response) => {
    const definition = entityBySlug(String(request.params.slug));
    if (!definition) throw new HttpError(404, 'Không tìm thấy API.');
    const options = z.object({ q: z.string().max(120).default(''), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), facultyId: idSchema.optional() }).parse(request.query);
    response.json(await listEntities(driver, config.database, definition, options));
  });
  api.post('/:slug', requireAdmin, async (request, response) => {
    const definition = entityBySlug(String(request.params.slug));
    if (!definition) throw new HttpError(404, 'Không tìm thấy API.');
    response.status(201).json(await createEntity(driver, config.database, definition, propertiesSchema.parse(request.body).properties));
  });
  api.get('/:slug/:id', async (request, response) => {
    const definition = entityBySlug(String(request.params.slug));
    if (!definition) throw new HttpError(404, 'Không tìm thấy API.');
    response.json(await entityDetail(driver, config.database, definition, idSchema.parse(request.params.id)));
  });
  api.patch('/:slug/:id', requireAdmin, async (request, response) => {
    const definition = entityBySlug(String(request.params.slug));
    if (!definition) throw new HttpError(404, 'Không tìm thấy API.');
    response.json(await updateEntity(driver, config.database, definition, idSchema.parse(request.params.id), propertiesSchema.parse(request.body).properties));
  });
  api.delete('/:slug/:id', requireAdmin, async (request, response) => {
    const definition = entityBySlug(String(request.params.slug));
    if (!definition) throw new HttpError(404, 'Không tìm thấy API.');
    const force = z.enum(['true', 'false']).optional().parse(request.query.force) === 'true';
    response.json(await deleteEntity(driver, config.database, definition, idSchema.parse(request.params.id), force));
  });
  api.use((_request, _response) => { throw new HttpError(404, 'Không tìm thấy API.'); });

  const webRoot = path.resolve(process.cwd(), 'apps/web/dist');
  if (existsSync(path.join(webRoot, 'index.html'))) {
    app.use(express.static(webRoot));
    app.get('/{*path}', (_request, response) => { response.sendFile(path.join(webRoot, 'index.html')); });
  }
  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (response.headersSent) return;
    if (error instanceof HttpError) { response.status(error.status).json({ error: error.message, details: error.details, requestId: response.locals.requestId }); return; }
    if (error instanceof z.ZodError) { response.status(400).json({ error: 'Dữ liệu nhập không hợp lệ.', details: error.issues, requestId: response.locals.requestId }); return; }
    if (error instanceof DataValidationError) { response.status(400).json({ error: 'Dữ liệu không đáp ứng mô hình.', details: error.issues, requestId: response.locals.requestId }); return; }
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') { response.status(413).json({ error: 'Nội dung yêu cầu vượt giới hạn 10 MiB.', requestId: response.locals.requestId }); return; }
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (/ConstraintValidationFailed|ConstraintVerificationFailed/.test(code)) { response.status(409).json({ error: 'Dữ liệu xung đột ràng buộc duy nhất.', requestId: response.locals.requestId }); return; }
    if (/ServiceUnavailable|SessionExpired|DatabaseNotFound|DatabaseUnavailable|TransientError/.test(code)) { response.status(503).json({ error: 'Cơ sở dữ liệu chưa sẵn sàng. Vui lòng kiểm tra Neo4j.', requestId: response.locals.requestId }); return; }
    if (error instanceof SyntaxError && 'body' in error) { response.status(400).json({ error: 'Nội dung JSON không hợp lệ.', requestId: response.locals.requestId }); return; }
    console.error('CourseGraph request failed', { requestId: response.locals.requestId, code: code || 'INTERNAL_ERROR' });
    response.status(500).json({ error: 'Không thể xử lý yêu cầu.', requestId: response.locals.requestId });
  };
  app.use(errorHandler);
  return app;
}

export { cookieName, businessLabels };
