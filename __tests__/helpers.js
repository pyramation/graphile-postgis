import { Pool } from 'pg';
import { parse, buildASTSchema, GraphQLSchema } from 'graphql';
const { printSchema } = require('graphql/utilities');

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('requires: TEST_DATABASE_URL');
}

export async function withPgPool(cb) {
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL
  });
  try {
    return await cb(pool);
  } finally {
    pool.end();
  }
}

export async function withPgClient(cb) {
  return withPgPool(async (pool) => {
    const client = await pool.connect();
    try {
      return await cb(client);
    } finally {
      client.release();
    }
  });
}

export async function withTransaction(cb, closeCommand = 'rollback') {
  return withPgClient(async (client) => {
    await client.query('begin');
    try {
      return await cb(client);
    } finally {
      await client.query(closeCommand);
    }
  });
}

export function printSchemaOrdered(originalSchema) {
  // Clone schema so we don't damage anything
  const schema = buildASTSchema(parse(printSchema(originalSchema)));

  const typeMap = schema.getTypeMap();
  Object.keys(typeMap).forEach((name) => {
    const gqlType = typeMap[name];

    // Object?
    if (gqlType.getFields) {
      const fields = gqlType.getFields();
      const keys = Object.keys(fields).sort();
      keys.forEach((key) => {
        const value = fields[key];

        // Move the key to the end of the object
        delete fields[key];
        fields[key] = value;

        // Sort args
        if (value.args) {
          value.args.sort((a, b) => a.name.localeCompare(b.name));
        }
      });
    }

    // Enum?
    if (gqlType.getValues) {
      gqlType.getValues().sort((a, b) => a.name.localeCompare(b.name));
    }
  });

  return printSchema(schema);
}
