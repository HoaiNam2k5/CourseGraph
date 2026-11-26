import neo4j, { type Driver, type ManagedTransaction } from 'neo4j-driver';
import type { AppConfig } from '../config.js';

export function createDriver(config: AppConfig): Driver {
  return neo4j.driver(config.neo4jUri, neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword), {
    maxConnectionPoolSize: 20,
    connectionAcquisitionTimeout: 10000,
    connectionTimeout: 10000,
    maxTransactionRetryTime: 10000,
  });
}

export function plain(value: unknown): unknown {
  if (neo4j.isInt(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

export function encodeProperties(properties: Record<string, string | number>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, typeof value === 'number' ? neo4j.int(value) : value]));
}

export async function readTransaction<T>(driver: Driver, database: string, work: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
  const session = driver.session({ database, defaultAccessMode: neo4j.session.READ });
  try { return await session.executeRead(work); } finally { await session.close(); }
}

export async function writeTransaction<T>(driver: Driver, database: string, work: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
  const session = driver.session({ database, defaultAccessMode: neo4j.session.WRITE });
  try { return await session.executeWrite(work); } finally { await session.close(); }
}

export async function graphWriteLock(tx: ManagedTransaction): Promise<void> {
  // The property dependency forces an exclusive lock before checking graph invariants.
  await tx.run("MERGE (lock:AppGraphLock {name:'business'}) ON CREATE SET lock.version=0 SET lock.version=lock.version+1");
}

export async function authWriteLock(tx: ManagedTransaction): Promise<void> {
  await tx.run("MERGE (lock:AppGraphLock {name:'auth'}) ON CREATE SET lock.version=0 SET lock.version=lock.version+1");
}
