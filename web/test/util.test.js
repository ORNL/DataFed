import { expect } from "chai";
import { isObjEmpty } from "../static/util.js";

describe("isObjEmpty", function () {
    it("should return true for an empty object", function () {
        const emptyObj = {};
        expect(isObjEmpty(emptyObj)).to.be.true;
    });

    it("should return false for an object with properties", function () {
        const objWithProps = { key: "value" };
        expect(isObjEmpty(objWithProps)).to.be.false;
    });

    it("should return true if a non-object is passed (like null)", function () {
        expect(isObjEmpty(null)).to.be.true;
    });

    it("should return true if a non-object is passed (like undefined)", function () {
        expect(isObjEmpty(undefined)).to.be.true;
    });
});
