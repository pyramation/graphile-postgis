const plugin = (builder) => {
  builder.hook('build', (build) => {
    const { pgIntrospectionResultsByKind: introspectionResultsByKind } = build;
    const pgGISExtension = introspectionResultsByKind.extension.find(
      (e) => e.name === 'postgis'
    );
    // Check we have the postgis extension
    if (!pgGISExtension) {
      console.warn('PostGIS extension not found in database; skipping');
      return build;
    }
    // Extract the geography and geometry types
    const pgGISGeometryType = introspectionResultsByKind.type.find(
      (t) =>
        t.name === 'geometry' && t.namespaceId === pgGISExtension.namespaceId
    );
    const pgGISGeographyType = introspectionResultsByKind.type.find(
      (t) =>
        t.name === 'geography' && t.namespaceId === pgGISExtension.namespaceId
    );
    if (!pgGISGeographyType || !pgGISGeometryType) {
      throw new Error(
        "PostGIS is installed, but we couldn't find the geometry/geography types!"
      );
    }
    return build.extend(build, {
      pgGISGraphQLTypesByTypeAndSubtype: {},
      pgGISGraphQLInterfaceTypesByType: {},
      pgGISGeometryType,
      pgGISGeographyType,
      pgGISExtension
    });
  });
};

export default plugin;
