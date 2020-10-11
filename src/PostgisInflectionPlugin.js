import { SUBTYPE_STRING_BY_SUBTYPE } from './constants';

const plugin = (builder) => {
  builder.hook('inflection', (inflection) => {
    return {
      ...inflection,
      gisType(type, subtype, hasZ, hasM) {
        return this.upperCamelCase(
          [
            type.name,
            SUBTYPE_STRING_BY_SUBTYPE[subtype],
            hasZ ? 'z' : null,
            hasM ? 'm' : null
          ]
            .filter((_) => _)
            .join('-')
        );
      },
      gisInterfaceName(type) {
        return this.upperCamelCase(`${type.name}-interface`);
      },
      gisDimensionInterfaceName(type, hasZ, hasM) {
        return this.upperCamelCase(
          [
            type.name,
            SUBTYPE_STRING_BY_SUBTYPE[0],
            hasZ ? 'z' : null,
            hasM ? 'm' : null
          ]
            .filter((_) => _)
            .join('-')
        );
      },
      geojsonFieldName() {
        return `geojson`;
      },
      gisXFieldName(type) {
        return type.name === 'geography' ? 'longitude' : 'x';
      },
      gisYFieldName(type) {
        return type.name === 'geography' ? 'latitude' : 'y';
      },
      gisZFieldName(type) {
        return type.name === 'geography' ? 'height' : 'z';
      }
    };
  });
};

export default plugin;
