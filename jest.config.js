module.exports = {
  setupFiles: ['<rootDir>/node_modules/regenerator-runtime/runtime'],
  testRegex: '(/__tests__/*.test.js|(\\.|/)(test|spec))\\.(js)$',
  testURL: 'http://localhost',
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  }
};
