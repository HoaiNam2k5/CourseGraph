import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  appOrigin: z.url().default('http://127.0.0.1:3000'),
  neo4jUri: z.string().min(1),
  neo4jUsername: z.string().min(1),
  neo4jPassword: z.string().min(1),
  neo4jDeployment: z.enum(['standalone', 'desktop', 'remote', 'unknown']).default('unknown'),
  neo4jBrowserUrl: z.url().refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  }, 'Browser URL must use HTTP(S) without credentials, query or fragment.').optional(),
  database: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,62}$/),
  testDatabase: z.string().regex(/^coursegraph-test(?:-[a-z0-9]+)?$/).default('coursegraph-test'),
  jwtSecret: z.string().min(32),
  jwtTtlSeconds: z.coerce.number().int().min(60).max(86400).default(3600),
  cookieSecure: z.boolean().default(false),
  mode: z.enum(['development', 'test', 'production']).default('development'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return schema.parse({
    host: process.env.HOST,
    port: process.env.PORT,
    appOrigin: process.env.APP_ORIGIN ?? (process.env.RENDER_EXTERNAL_URL || undefined),
    neo4jUri: process.env.NEO4J_URI,
    neo4jUsername: process.env.NEO4J_USERNAME,
    neo4jPassword: process.env.NEO4J_PASSWORD,
    neo4jDeployment: process.env.NEO4J_DEPLOYMENT,
    neo4jBrowserUrl: process.env.NEO4J_BROWSER_URL || undefined,
    database: process.env.NEO4J_DATABASE,
    testDatabase: process.env.NEO4J_TEST_DATABASE,
    jwtSecret: process.env.JWT_SECRET,
    jwtTtlSeconds: process.env.JWT_TTL_SECONDS,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    mode: process.env.NODE_ENV ?? 'development',
    ...overrides,
  });
}
