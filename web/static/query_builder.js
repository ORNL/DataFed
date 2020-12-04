export class QueryBuilder extends HTMLElement {
    /*static get observedAttributes(){
        return ['schema','query'];
    }*/
    static _top_html = "<button class='btn-opr-group qb-btn-icon'>AND</button><button class='btn-add-field qb-btn-icon'><span class='ui-icon ui-icon-input'></span></button><button class='btn-add-group qb-btn-icon'>( )</button>";
    static _grp_html = "<button class='btn-opr-group qb-btn-icon'>AND</button><button class='btn-add-field qb-btn-icon'><span class='ui-icon ui-icon-input'></span></button><button class='btn-add-group qb-btn-icon'>( )</button><div style='float:right'><button class='btn-rem-group qb-btn-icon'><span class='ui-icon ui-icon-close'></span></button></div>";
    static _fld_html = "<button class='btn-sel-field'>Select Field...</button><button class='btn-opr-field' disabled>Operator</button><div style='float:right'><button class='btn-rem-field qb-btn-icon'><span class='ui-icon ui-icon-close'></span></button></div>";
    //static _fld_html = "<select class='sel-field'><option>AAA</option><option>BBBBB</option><option>CCCCCCCCCCCCCCCCCC</option><option>DDD</option><option>EEE</option><option>FFF</option></select><div style='float:right'><button class='btn-rem-field qb-btn-icon'><span class='ui-icon ui-icon-close'></span></button></div>";

    constructor(){
        super();
        //var shadowRoot = this.attachShadow({mode: 'open'});
        //shadowRoot.innerHTML = 'Query Builder with styling';
        //const wrapper = document.createElement('div');
        //wrapper.setAttribute('class','query-builder');

        //this._cont = document.createElement('div');
        //this._cont.setAttribute('class','query-builder-container');
        //this._cont.innerHTML = "some text in wrapper";
        //shadowRoot.append( this._cont );
        
        //this.innerHTML = "<div class='query-builder-container'></div>";

        this._sch = null;
        this._qry = {};
    }

    connectedCallback(){
        console.log("query builder is on the page!")

        this._ui_front = $(this).closest(".ui-front");

        $(this).on( "click", ".btn-add-group", ev => this._groupAddBtnClick( ev ));
        $(this).on( "click", ".btn-rem-group", ev => this._groupRemBtnClick( ev ));
        $(this).on( "click", ".btn-opr-group", ev => this._groupOpBtnClick( ev ));
        $(this).on( "click", ".btn-add-field", ev => this._fieldAddBtnClick( ev ));
        $(this).on( "click", ".btn-rem-field", ev => this._fieldRemBtnClick( ev ));
        $(this).on( "click", ".btn-sel-field", ev => this._fieldSelectBtnClick( ev ));
    }

    disconnectedCallback(){
        console.log("query builder has been removed")
    }

    init( a_schema, a_query ){
        this._sch = a_schema;
        this._qry = a_query;

        var grp = document.createElement('div');
        grp.setAttribute('class','query-builder-group');
        grp.style.background = "#004000";
        grp.style.margin = "0";
        grp.innerHTML = QueryBuilder._top_html;
        $("button",grp).button();

        this.append( grp );
    }

    getSchema(){
        return this._sch;
    }

    getQuery(){
        return this._qry;
    }

    _groupAdd( a_container ){
        var grp = document.createElement('div');
        grp.setAttribute('class','query-builder-group');
        grp.innerHTML = QueryBuilder._grp_html;
        $("button",grp).button();

        a_container.append( grp );
    }

    _fieldAdd( a_container ){
        var fld = document.createElement('div');
        fld.setAttribute('class','query-builder-field');
        fld.innerHTML = QueryBuilder._fld_html;
        $("button",fld).button();
        //$("select",fld).selectmenu({ appendTo: this._ui_front, width: "auto", position: { my: "left top", at: "left bottom", collision: "flip" }});

        a_container.append( fld );
    }

    _groupAddBtnClick( ev ){
        console.log("group add");
        var div = ev.currentTarget.closest("div.query-builder-group");
        this._groupAdd( div );
    }

    _groupRemBtnClick( ev ){
        console.log("group rem");
        var div = ev.currentTarget.closest("div.query-builder-group");
        if ( div )
            div.remove();
    }

    _groupOpBtnClick( ev ){
        console.log("group oper", ev.currentTarget );
        if ( ev.currentTarget.innerText == "AND" ){
            $(ev.currentTarget).button('option', 'label', 'OR');
        }else{
            $(ev.currentTarget).button('option', 'label', 'AND');
        }
    }

    _fieldAddBtnClick( ev ){
        console.log("field add", ev );
        var div = ev.currentTarget.closest("div.query-builder-group");

        this._fieldAdd( div );
    }

    _fieldRemBtnClick( ev ){
        console.log("field rem");
        var div = ev.currentTarget.closest("div.query-builder-field");
        div.remove();
    }

    _fieldSelectBtnClick( ev ){
        console.log("field select");
        selectSchemaField( this._sch, ev.currentTarget, function( field ){
            console.log("field selected");
        })
    }
}

export function selectSchemaField( a_sch_fields, a_target, a_cb ){
    console.log("show query builder dialog");

    var frame = $(document.createElement('div'));

    frame.html("Schema Tree");

    var options = {
        title: "Select Schema Field",
        modal: true,
        width: 400,
        height: 350,
        resizable: true,
        position:{
            my: "left",
            at: "right",
            of: a_target,
            collision: "flip"
        },
        dialogClass: "qb-field-sel-dlg",
        buttons: [{
            text: "Cancel",
            click: function() {
                $(this).dialog('close');
            }
        },{
            id:"ok_btn",
            text: "Ok",
            click: function() {
                if ( a_cb )
                    a_cb();

                $(this).dialog('close');
            }
        }],
        open: function( ev, ui ){
            $(".btn",frame).button();
            $('input',frame).addClass("ui-widget ui-widget-content");
        },
        close: function( ev, ui ) {
            $(this).dialog("destroy").remove();
        }
    };


    frame.dialog( options );
}

customElements.define( 'query-builder', QueryBuilder );