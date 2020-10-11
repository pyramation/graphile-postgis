import { GIS_SUBTYPE } from './constants';
import { getGISTypeName } from './utils';

const plugin = (builder) => {
  builder.hook('GraphQLObjectType:fields', (fields, build, context) => {
    const {
      scope: { isPgGISType, pgGISType, pgGISTypeDetails }
    } = context;
    if (
      !isPgGISType ||
      !pgGISTypeDetails ||
      pgGISTypeDetails.subtype !== GIS_SUBTYPE.MultiPoint
    ) {
      return fields;
    }
    const {
      extend,
      getPostgisTypeByGeometryType,
      graphql: { GraphQLList }
    } = build;
    const { hasZ, hasM, srid } = pgGISTypeDetails;
    const Point = getPostgisTypeByGeometryType(
      pgGISType,
      GIS_SUBTYPE.Point,
      hasZ,
      hasM,
      srid
    );

    return extend(fields, {
      points: {
        type: new GraphQLList(Point),
        resolve(data) {
          return data.__geojson.coordinates.map((coord) => ({
            __gisType: getGISTypeName(GIS_SUBTYPE.Point, hasZ, hasM),
            __srid: data.__srid,
            __geojson: {
              type: 'Point',
              coordinates: coord
            }
          }));
        }
      }
    });
  });
};
export default plugin;
