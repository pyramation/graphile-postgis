# graphile-postgis


```sh
createdb graphile_test
psql graphile_test -f __tests__/schema.sql
export TEST_DATABASE_URL=postgres://localhost:5432/graphile_test
yarn test:watch
```