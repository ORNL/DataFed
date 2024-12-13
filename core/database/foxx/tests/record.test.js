"use strict"

const chai = require('chai');
const expect = chai.expect;
const Record = require('../api/record');

describe('Record Class', () => {
    let collectionMock;

    beforeEach(() => {
        collectionMock = {
            exists: sinon.stub()
        };
        sinon.stub(db, '_collection').returns(collectionMock);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should initialize correctly and check record existence', () => {
        collectionMock.exists.withArgs('validKey').returns(true);

        const record = new Record('validKey');
        expect(record.exists).to.be.true;
        expect(record.key).to.equal('validKey');
    });

    it('should return error code and message', () => {
        const record = new Record();
        record.error = 'ERR_CODE';
        record.err_msg = 'Error message';
        expect(record.error()).to.equal('ERR_CODE');
        expect(record.errorMessage()).to.equal('Error message');
    });

    it('should validate record path consistency', () => {
        const record = new Record('validKey');
        record.alloc = { path: '/expected/path/' };
        record.key = 'validKey';

        const result = record.isRecordPathConsistent('/expected/path/validKey');
        expect(result).to.be.true;
    });
});
