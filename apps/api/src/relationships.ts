import neo4j, { type Driver } from 'neo4j-driver';
import { z } from 'zod';
import { entityByLabel, entityNameKeys, relationshipDefinitions } from '../../../packages/shared/src/catalog.js';
import { foldSearchText } from '../../../packages/shared/src/search.js';
import { readTransaction } from './db/connection.js';

const types = new Set(relationshipDefinitions.map((rule) => rule.type));
export const relationshipQuery = z.object({
  q: z.string().max(120).default(''),
  type: z.string().refine((value) => value === '' || types.has(value)).default(''),
  sort: z.enum(['from', 'to', 'type']).default('from'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const rules = relationshipDefinitions.map((rule) => ({
  ...rule,
  fromKey: entityByLabel(rule.from)!.key,
  toKey: entityByLabel(rule.to)!.key,
  fromNameKey: entityNameKeys[rule.from],
  toNameKey: entityNameKeys[rule.to],
}));

// The combining marks in decomposed Vietnamese vowels and tones.
const vowelMarks = [...'\u0300\u0301\u0303\u0309\u0323\u0302\u0306\u031b'];
const sortKeys = { from: 'fromName', to: 'toName', type: 'rule.title' } as const;

export async function listRelationships(driver: Driver, database: string, query: z.infer<typeof relationshipQuery>) {
  const needle = foldSearchText(query.q);
  const allowed = rules.filter((rule) => !query.type || rule.type === query.type);
  const match = `
    MATCH (a)-[r]->(b)
    WHERE type(r) IN $types
    WITH a, b, head([d IN $rules WHERE d.type = type(r) AND d.from IN labels(a) AND d.to IN labels(b)]) AS rule
    WHERE rule IS NOT NULL
    WITH rule, a[rule.fromKey] AS fromId, b[rule.toKey] AS toId,
         coalesce(a[rule.fromNameKey], a[rule.fromKey]) AS fromName,
         coalesce(b[rule.toNameKey], b[rule.toKey]) AS toName`;
  const filter = needle ? `
    WHERE any(value IN [fromId, toId, fromName, toName, rule.type, rule.title] WHERE
      reduce(folded = replace(toLower(normalize(value, NFD)), 'đ', 'd'),
             mark IN $marks | replace(folded, mark, '')) CONTAINS $needle)` : '';
  const params = { types: [...new Set(allowed.map((rule) => rule.type))], rules: allowed, marks: vowelMarks, needle };
  const direction = query.order === 'desc' ? 'DESC' : 'ASC';
  const orderedPage = `
    WITH * ORDER BY ${sortKeys[query.sort]} ${direction}, rule.from, fromId, rule.type, rule.to, toId
    SKIP $skip LIMIT $limit
    RETURN {fromLabel: rule.from, fromId: fromId, fromName: fromName, type: rule.type,
            toLabel: rule.to, toId: toId, toName: toName} AS edge`;

  return readTransaction(driver, database, async (tx) => {
    const counts = await tx.run(match + filter + ' RETURN count(*) AS total', params);
    const page = await tx.run(match + filter + orderedPage, {
      ...params, skip: neo4j.int((query.page - 1) * query.pageSize), limit: neo4j.int(query.pageSize),
    });
    return {
      items: page.records.map((record) => record.get('edge')),
      total: counts.records[0].get('total').toNumber(),
      page: query.page, pageSize: query.pageSize,
    };
  });
}
