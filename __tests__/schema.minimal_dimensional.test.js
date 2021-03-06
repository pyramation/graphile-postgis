import { withPgClient, printSchemaOrdered } from './helpers';
import { createPostGraphileSchema } from 'postgraphile-core';
import PostgisPlugin from '../src/index';

const schemas = ['graphile_postgis_minimal_dimensional'];
const options = {
  appendPlugins: [PostgisPlugin]
};

test('prints a schema with this plugin', () =>
  withPgClient(async (client) => {
    const gqlSchema = await createPostGraphileSchema(client, schemas, options);
    expect(printSchemaOrdered(gqlSchema)).toMatchSnapshot();
  }));
