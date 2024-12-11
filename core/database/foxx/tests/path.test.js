"use strict"

const chai = require('chai');
const expect = chai.expect;
const pathModule = require('./pathModule'); // Replace with the actual file name

describe('splitPOSIXPath', function () {
  it('should split a simple POSIX path into components', function () {
    const result = pathModule.splitPOSIXPath('/usr/local/bin/node');
    expect(result).to.deep.equal(['usr', 'local', 'bin', 'node']);
  });

  it('should handle root path and return an empty array', function () {
    const result = pathModule.splitPOSIXPath('/');
    expect(result).to.deep.equal([]);
  });

  it('should handle paths with trailing slashes correctly', function () {
    const result = pathModule.splitPOSIXPath('/usr/local/bin/');
    expect(result).to.deep.equal(['usr', 'local', 'bin']);
  });

  it('should handle empty paths and throw an error', function () {
    expect(() => pathModule.splitPOSIXPath('')).to.throw('Invalid POSIX path');
  });

  it('should handle null or undefined paths and throw an error', function () {
    expect(() => pathModule.splitPOSIXPath(null)).to.throw('Invalid POSIX path');
    expect(() => pathModule.splitPOSIXPath(undefined)).to.throw('Invalid POSIX path');
  });

  it('should handle non-string inputs and throw an error', function () {
    expect(() => pathModule.splitPOSIXPath(123)).to.throw('Invalid POSIX path');
    expect(() => pathModule.splitPOSIXPath({})).to.throw('Invalid POSIX path');
    expect(() => pathModule.splitPOSIXPath([])).to.throw('Invalid POSIX path');
  });
});
