import { getGISTypeDetails, getGISTypeModifier, getGISTypeName } from "./utils";
import { SQL } from "pg-sql2";
import makeGeoJSONType from "./makeGeoJSONType";

function identity(input) {
  return input;
}

const plugin = builder => {
  builder.hook("build", build => {
    const GeoJSON = makeGeoJSONType(
      build.graphql,
      build.inflection.builtin("GeoJSON")
    );
    build.addType(GeoJSON);

    return build.extend(build, {
      getPostgisTypeByGeometryType(
        pgGISType,
        subtype,
        hasZ = false,
        hasM = false,
        srid = 0
      ) {
        const typeModifier = getGISTypeModifier(subtype, hasZ, hasM, srid);
        return this.pgGetGqlTypeByTypeIdAndModifier(pgGISType.id, typeModifier);
      },
      pgGISIncludedTypes: [],
      pgGISIncludeType(Type) {
        this.pgGISIncludedTypes.push(Type);
      },
    });
  });

  builder.hook(
    "init",
    (_, build) => {
      const {
        newWithHooks,
        pgIntrospectionResultsByKind: introspectionResultsByKind,
        graphql: {
          GraphQLInt,
          GraphQLNonNull,
          GraphQLInterfaceType,
          GraphQLObjectType,
        },
        pgRegisterGqlTypeByTypeId,
        pgRegisterGqlInputTypeByTypeId,
        pgTweaksByTypeIdAndModifer,
        getTypeByName,
        pgSql: sql,
        pg2gql,
        pg2GqlMapper,
        inflection,
        pgGISGraphQLTypesByTypeAndSubtype: constructedTypes,
        pgGISGraphQLInterfaceTypesByType: _interfaces,
        pgGISGeometryType: GEOMETRY_TYPE,
        pgGISGeographyType: GEOGRAPHY_TYPE,
        pgGISExtension: POSTGIS,
        pgGISIncludeType: includeType,
      } = build;
      if (!GEOMETRY_TYPE || !GEOGRAPHY_TYPE) {
        return _;
      }
      debug("PostGIS plugin enabled");

      const GeoJSON = getTypeByName(inflection.builtin("GeoJSON"));
      const geojsonFieldName = inflection.geojsonFieldName();

      function getGisInterface(type) {
        const zmflag = -1; // no dimensional constraint; could be xy/xyz/xym/xyzm
        if (!_interfaces[type.id]) {
          _interfaces[type.id] = {};
        }
        if (!_interfaces[type.id][zmflag]) {
          _interfaces[type.id][zmflag] = newWithHooks(
            GraphQLInterfaceType,
            {
              name: inflection.gisInterfaceName(type),
              fields: {
                [geojsonFieldName]: {
                  type: GeoJSON,
                  description: "Converts the object to GeoJSON",
                },
                srid: {
                  type: new GraphQLNonNull(GraphQLInt),
                  description: "Spatial reference identifier (SRID)",
                },
              },
              resolveType(value, _info) {
                const Type =
                  constructedTypes[type.id] &&
                  constructedTypes[type.id][value.__gisType];
                return Type;
              },
              description: `All ${type.name} types implement this interface`,
            },
            {
              isPgGISInterface: true,
              pgGISType: type,
              pgGISZMFlag: zmflag,
            }
          );
          // Force creation of all GraphQL types that could be resolved from this interface
          const subtypes = [1, 2, 3, 4, 5, 6, 7];
          for (const subtype of subtypes) {
            for (const hasZ of [false, true]) {
              for (const hasM of [false, true]) {
                const typeModifier = getGISTypeModifier(subtype, hasZ, hasM, 0);
                const Type = getGisType(type, typeModifier);
                includeType(Type);
              }
            }
          }
        }
        return _interfaces[type.id][zmflag];
      }
      function getGisDimensionInterface(
        type,
        hasZ,
        hasM
      ) {
        const zmflag = (hasZ ? 2 : 0) + (hasM ? 1 : 0); // Equivalent to ST_Zmflag: https://postgis.net/docs/ST_Zmflag.html
        const coords = { 0: "XY", 1: "XYM", 2: "XYZ", 3: "XYZM" }[zmflag];
        if (!_interfaces[type.id]) {
          _interfaces[type.id] = {};
        }
        if (!_interfaces[type.id][zmflag]) {
          _interfaces[type.id][zmflag] = newWithHooks(
            GraphQLInterfaceType,
            {
              name: inflection.gisDimensionInterfaceName(type, hasZ, hasM),
              fields: {
                [geojsonFieldName]: {
                  type: GeoJSON,
                  description: "Converts the object to GeoJSON",
                },
                srid: {
                  type: new GraphQLNonNull(GraphQLInt),
                  description: "Spatial reference identifier (SRID)",
                },
              },
              resolveType(value, _info) {
                const Type =
                  constructedTypes[type.id] &&
                  constructedTypes[type.id][value.__gisType];
                return Type;
              },
              description: `All ${type.name} ${coords} types implement this interface`,
            },
            {
              isPgGISDimensionInterface: true,
              pgGISType: type,
              pgGISZMFlag: zmflag,
            }
          );
          // Force creation of all GraphQL types that could be resolved from this interface
          const subtypes = [1, 2, 3, 4, 5, 6, 7];
          for (const subtype of subtypes) {
            const typeModifier = getGISTypeModifier(subtype, hasZ, hasM, 0);
            const Type = getGisType(type, typeModifier);
            includeType(Type);
          }
        }
        return _interfaces[type.id][zmflag];
      }
      function getGisType(type, typeModifier) {
        const typeId = type.id;
        const typeDetails = getGISTypeDetails(typeModifier);
        const { subtype, hasZ, hasM, srid } = typeDetails;
        debug(
          `Getting ${type.name} type ${type.id}|${typeModifier}|${subtype}|${hasZ}|${hasM}|${srid}`
        );
        if (!constructedTypes[type.id]) {
          constructedTypes[type.id] = {};
        }
        const typeModifierKey = typeModifier != null ? typeModifier : -1;
        if (!pgTweaksByTypeIdAndModifer[typeId]) {
          pgTweaksByTypeIdAndModifer[typeId] = {};
        }
        if (!pgTweaksByTypeIdAndModifer[typeId][typeModifierKey]) {
          pgTweaksByTypeIdAndModifer[typeId][typeModifierKey] = (
            fragment,
            _resolveData
          ) => {
            const params = [
              sql.literal("__gisType"),
              sql.fragment`${sql.identifier(
                POSTGIS.namespaceName || "public",
                "postgis_type_name" // MUST be lowercase!
              )}(
                ${sql.identifier(
                  POSTGIS.namespaceName || "public",
                  "geometrytype" // MUST be lowercase!
                )}(${fragment}),
                ${sql.identifier(
                  POSTGIS.namespaceName || "public",
                  "st_coorddim" // MUST be lowercase!
                )}(${fragment}::text)
              )`,
              sql.literal("__srid"),
              sql.fragment`${sql.identifier(
                POSTGIS.namespaceName || "public",
                "st_srid" // MUST be lowercase!
              )}(${fragment})`,
              sql.literal("__geojson"),
              sql.fragment`${sql.identifier(
                POSTGIS.namespaceName || "public",
                "st_asgeojson" // MUST be lowercase!
              )}(${fragment})::JSON`,
            ];
            return sql.fragment`(case when ${fragment} is null then null else json_build_object(
            ${sql.join(params, ", ")}
          ) end)`;
          };
        }
        const gisTypeKey =
          typeModifier != null ? getGISTypeName(subtype, hasZ, hasM) : -1;
        if (!constructedTypes[type.id][gisTypeKey]) {
          if (typeModifierKey === -1) {
            constructedTypes[type.id][gisTypeKey] = getGisInterface(type);
          } else if (subtype === 0) {
            constructedTypes[type.id][gisTypeKey] = getGisDimensionInterface(
              type,
              hasZ,
              hasM
            );
          } else {
            const intType = introspectionResultsByKind.type.find(
              (t) =>
                t.name === "int4" && t.namespaceName === "pg_catalog"
            );
            const jsonType = introspectionResultsByKind.type.find(
              (t) =>
                t.name === "json" && t.namespaceName === "pg_catalog"
            );

            constructedTypes[type.id][gisTypeKey] = newWithHooks(
              GraphQLObjectType,
              {
                name: inflection.gisType(type, subtype, hasZ, hasM, srid),
                interfaces: () => [
                  getGisInterface(type),
                  getGisDimensionInterface(type, hasZ, hasM),
                ],
                fields: {
                  [geojsonFieldName]: {
                    type: GeoJSON,
                    resolve: (
                      data,
                      _args,
                      _context,
                      _resolveInfo
                    ) => {
                      return pg2gql(data.__geojson, jsonType);
                    },
                  },
                  srid: {
                    type: new GraphQLNonNull(GraphQLInt),
                    resolve: (
                      data,
                      _args,
                      _context,
                      _resolveInfo
                    ) => {
                      return pg2gql(data.__srid, intType);
                    },
                  },
                },
              },
              {
                isPgGISType: true,
                pgGISType: type,
                pgGISTypeDetails: typeDetails,
              }
            );
          }
        }
        return constructedTypes[type.id][gisTypeKey];
      }

      debug(`Registering handler for ${GEOGRAPHY_TYPE.id}`);

      pgRegisterGqlInputTypeByTypeId(GEOGRAPHY_TYPE.id, () => GeoJSON);
      pg2GqlMapper[GEOGRAPHY_TYPE.id] = {
        map: identity,
        unmap: (o) =>
          sql.fragment`st_geomfromgeojson(${sql.value(
            JSON.stringify(o)
          )}::text)::${sql.identifier(
            POSTGIS.namespaceName || "public",
            "geography"
          )}`,
      };

      pgRegisterGqlTypeByTypeId(
        GEOGRAPHY_TYPE.id,
        (_set, typeModifier) => {
          return getGisType(GEOGRAPHY_TYPE, typeModifier);
        }
      );

      debug(`Registering handler for ${GEOMETRY_TYPE.id}`);

      pgRegisterGqlInputTypeByTypeId(GEOMETRY_TYPE.id, () => GeoJSON);
      pg2GqlMapper[GEOMETRY_TYPE.id] = {
        map: identity,
        unmap: (o) =>
          sql.fragment`st_geomfromgeojson(${sql.value(
            JSON.stringify(o)
          )}::text)`,
      };

      pgRegisterGqlTypeByTypeId(
        GEOMETRY_TYPE.id,
        (_set, typeModifier) => {
          return getGisType(GEOMETRY_TYPE, typeModifier);
        }
      );
      return _;
    },
    ["PostgisTypes"],
    ["PgTables"],
    ["PgTypes"]
  );

  builder.hook("GraphQLSchema", (schema, build) => {
    if (!schema.types) {
      schema.types = [];
    }
    schema.types = [...schema.types, ...build.pgGISIncludedTypes];
    return schema;
  });
};

export default plugin;
