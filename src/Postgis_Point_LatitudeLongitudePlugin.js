import { GIS_SUBTYPE } from "./constants";

const plugin = builder => {
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      scope: { isPgGISType, pgGISType, pgGISTypeDetails },
    } = context;
    if (
      !isPgGISType ||
      !pgGISTypeDetails ||
      pgGISTypeDetails.subtype !== GIS_SUBTYPE.Point
    ) {
      return fields;
    }
    const {
      extend,
      graphql: { GraphQLNonNull, GraphQLFloat },
      inflection,
    } = build;
    const xFieldName = inflection.gisXFieldName(pgGISType);
    const yFieldName = inflection.gisYFieldName(pgGISType);
    const zFieldName = inflection.gisZFieldName(pgGISType);
    return extend(fields, {
      [xFieldName]: {
        type: new GraphQLNonNull(GraphQLFloat),
        resolve(data) {
          return data.__geojson.coordinates[0];
        },
      },
      [yFieldName]: {
        type: new GraphQLNonNull(GraphQLFloat),
        resolve(data) {
          return data.__geojson.coordinates[1];
        },
      },
      ...(pgGISTypeDetails.hasZ
        ? {
            [zFieldName]: {
              type: new GraphQLNonNull(GraphQLFloat),
              resolve(data) {
                return data.__geojson.coordinates[2];
              },
            },
          }
        : {}),
    });
  });
};
export default plugin;
