import sinon from "sinon";

export function createMockServices() {
    return {
        api: {
            epView: sinon.stub(),
            epAutocomplete: sinon.stub(),
            xfrStart: sinon.stub(),
        },
        dialogs: {
            dlgAlert: sinon.stub(),
        },
    };
}

export function setupJQueryMocks(sandbox) {
    const jQueryStub = {
        addClass: sandbox.stub().returnsThis(),
        autocomplete: sandbox.stub().returnsThis(),
        button: sandbox.stub().returnsThis(),
        checkboxradio: sandbox.stub().returnsThis(),
        dialog: sandbox.stub().returnsThis(),
        fancytree: sandbox.stub(),
        hasClass: sandbox.stub().returns(false),
        html: sandbox.stub().returnsThis(),
        length: 1,
        on: sandbox.stub().returnsThis(),
        prop: sandbox.stub().returnsThis(),
        removeClass: sandbox.stub().returnsThis(),
        select: sandbox.stub().returnsThis(),
        show: sandbox.stub().returnsThis(),
        val: sandbox.stub().returns("/test/path"),
    };

    global.$ = sandbox.stub().returns(jQueryStub);
    global.$.ui = {
        fancytree: {
            getTree: sandbox.stub().returns({
                getSelectedNodes: () => [{ key: "record1" }, { key: "record2" }],
            }),
        },
    };

    return jQueryStub;
}
