import * as util from "./util.js";

export class QueryBuilder extends HTMLElement {
    /*static get observedAttributes(){
        return ['schema','query'];
    }*/
    //static _top_html = "<button class='btn-opr-group qb-btn-icon' title='Change operator to combine contained items'>AND</button><button class='btn-add-field qb-btn-icon' title='Add new field'><span class='ui-icon ui-icon-input'></span></button><button class='btn-add-group qb-btn-icon' title='Add new sub-group'>( )</button>";
    //static _grp_html = "<button class='btn-opr-group qb-btn-icon' title='Change operator to combine contained items'>AND</button><button class='btn-add-field qb-btn-icon' title='Add new field'><span class='ui-icon ui-icon-input'></span></button><button class='btn-add-group qb-btn-icon' title='Add new sub-group'>( )</button><div style='float:right'><button class='btn-rem-group qb-btn-icon'><span class='ui-icon ui-icon-close'></span></button></div>";
    static _top_html = "<button class='btn-opr-group qb-btn-icon'>AND</button><button class='btn-add-field qb-btn-icon'><span class='ui-icon ui-icon-input'></span></button><button class='btn-add-group qb-btn-icon'>( )</button>";
    static _grp_html = "<button class='btn-opr-group qb-btn-icon'>AND</button><button class='btn-add-field qb-btn-icon'><span class='ui-icon ui-icon-input'></span></button><button class='btn-add-group qb-btn-icon'>( )</button><div style='float:right'><button class='btn-rem-group qb-btn-icon'><span class='ui-icon ui-icon-close'></span></button></div>";
    static _fld_html = "<button class='btn-sel-field'>Select Field...</button><select class='sel-opr-field' disabled></select><input class='inp-val-field'></input><div style='float:right'><button class='btn-rem-field qb-btn-icon'><span class='ui-icon ui-icon-close'></span></button></div>";
    //static _fld_html = "<select class='sel-field'><option>AAA</option><option>BBBBB</option><option>CCCCCCCCCCCCCCCCCC</option><option>DDD</option><option>EEE</option><option>FFF</option></select><div style='float:right'><button class='btn-rem-field qb-btn-icon'><span class='ui-icon ui-icon-close'></span></button></div>";

    static _FLD_STR     = 1;
    static _FLD_NUM     = 2;
    static _FLD_BOOL    = 3;

    static _OPR_AND     = 1;
    static _OPR_OR      = 2;
    static _OPR_LT      = 3;
    static _OPR_LTE     = 4;
    static _OPR_EQ      = 5;
    static _OPR_NEQ     = 6;
    static _OPR_GTE     = 7;
    static _OPR_GT      = 8;
    static _OPR_RNG     = 9;
    static _OPR_DF      = 10;
    static _OPR_NDF     = 11;
    static _OPR_RGX     = 12;
    static _OPR_WLD     = 13;

    static _oper_label = {
        _OPR_AND : "And",
        _OPR_OR  : "Or",
        _OPR_LT  : "<",
        _OPR_LTE : "<=",
        _OPR_EQ  : "==",
        _OPR_NEQ : "<>",
        _OPR_GTE : ">=",
        _OPR_GT  : ">",
        _OPR_RNG : "Range",
        _OPR_DF  : "Defined",
        _OPR_NDF : "Not Defined",
        _OPR_RGX : "RegEx",
        _OPR_WLD : "Wildcard",
        _OPR_T   : "True",
        _OPR_F   : "False"
    };

    static _fld_cfg = {
        _FLD_STR: [_OPR_EQ,_OPR_NEQ,_OPR_RGX,_OPR_WLD,_OPR_DF,_OPR_NDF],
        _FLD_NUM: [_OPR_EQ,_OPR_NEQ,_OPR_LT,_OPR_LTE,_OPR_GTE,_OPR_GT,_OPR_RNG,_OPR_DF,_OPR_NDF],
        _FLD_BOOL: [_OPR_T,_OPR_F,_OPR_DF,_OPR_NDF],
    }

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
        //console.log("query builder is on the page!")

        this._ui_front = $(this).closest(".ui-front");

        $(this).on( "click", ".btn-add-group", ev => this._groupAddBtnClick( ev ));
        $(this).on( "click", ".btn-rem-group", ev => this._groupRemBtnClick( ev ));
        $(this).on( "click", ".btn-opr-group", ev => this._groupOpBtnClick( ev ));
        $(this).on( "click", ".btn-add-field", ev => this._fieldAddBtnClick( ev ));
        $(this).on( "click", ".btn-rem-field", ev => this._fieldRemBtnClick( ev ));
        $(this).on( "click", ".btn-sel-field", ev => this._fieldSelectBtnClick( ev ));
    }

    disconnectedCallback(){
        //console.log("query builder has been removed")
    }

    init( a_schema, a_query ){
        this._sch = a_schema;
        this._qry = a_query;
        this._sch_fields = {};
        this._sch.def = JSON.parse( this._sch.def );

        this._buildFieldSchema( this._sch.def.properties, this._sch_fields, this._sch.def._refs );
        this._buildFieldHTML();

        var grp = document.createElement('div');
        grp.setAttribute('class','query-builder-group');
        grp.style.background = "#004000";
        grp.style.margin = "0";
        grp.innerHTML = QueryBuilder._top_html;
        $("button",grp).button();

        this.append( grp );

        //util.tooltipTheme( $(grp) );
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
        a_container.append( fld );
        $("button",fld).button();
        $("select",fld).selectmenu({width:false});
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
        this._selectSchemaField( ev.currentTarget, function( field ){
            console.log("selected:", field );

            var btn = $(ev.currentTarget),
                div = btn.closest(".query-builder-field"),
                sel = $(".sel-opr-field",div),
                val = $(".inp-val-field",div),
                path = field[field.length-1],
                label;

            for ( var i = field.length - 2; i >= 0; i-- ){
                path = field[i] + "." + path;
            }

            if ( path.length > 20 ){
                label = "..." + path.substr(path.length-20);
            }else{
                label = path;
            }

            btn.button("option","label", label );
            btn.attr("title", path );
            util.tooltipTheme( btn );

            sel.html("<option>AAA</option><option>BBB</option>");
            sel.selectmenu("enable");
            sel.selectmenu("refresh");

            val.show();
        })
    }

    _selectSchemaField( a_target, a_cb ){
        //console.log("show query builder dialog");

        var frame = $(document.createElement('div')),
            frame_outer,
            dlg_inst;

        /*frame.html("<table class='qb-field-sel-tree no-border'>\
            <colgroup><col width='*'></col><col></col></colgroup>\
            <tbody><tr><td style='white-space: nowrap;padding:0 2em 0 0'></td><td style='white-space:nowrap'></td></tr></tbody>\
        </table>");*/

        frame.html("<div class='qb-field-sel-tree no-border'></div>");

        function dlgSubmit( a_node ){
            if ( a_cb ){
                var node = a_node?a_node:tree.getSelectedNodes()[0],
                    path = [node.key];
                while ( node.parent.parent ){
                    node = node.parent;
                    path.unshift( node.key );
                }
                a_cb( path );
            }

            dlg_inst.dialog('close');
        }

        var tree_opts = {
            extensions: ["themeroller","filter"],
            themeroller: {
                activeClass: "my-fancytree-active",
                hoverClass: ""
            },
            filter:{
                autoExpand: true,
                mode: "hide"
            },
            source: this.sch_field_src,
            nodata: false,
            icon: false,
            selectMode: 1,
            checkbox: false,
            autoActivate: true,
            activate:function( ev, data ) {
                data.node.setSelected( true );
                if ( data.node.isFolder() )
                    $("#ok_btn",frame_outer).button("disable");
                else
                    $("#ok_btn",frame_outer).button("enable");
            },
            keydown:function( ev, data ) {
                if ( ev.keyCode == 13 && !data.node.isFolder() ){
                    dlgSubmit( data.node );
                }
            },
            click:function( ev, data ) {
                if ( !data.node.isFolder() ){
                    dlgSubmit( data.node );
                }
            },
            init: function( ev, data ){
                data.tree.rootNode.children[0].setActive( true );
            }
        };

        var options = {
            title: "Select Schema Field",
            modal: true,
            //width: 'auto',
            resizable: true,
            minWidth: 0,
            minHeight: 0,
            create: function() {
                $(this).css("maxHeight", 50);        
                $(this).css("maxWidth", 400);        
            },
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
                    dlg_inst.dialog('close');
                }
            },{
                id:"ok_btn",
                text: "Ok",
                click: function() {
                    dlgSubmit();
                }
            }],
            open: function( ev, ui ){
                dlg_inst = $(this);
                $(".btn",frame).button();
                $('input',frame).addClass("ui-widget ui-widget-content");
                frame_outer = frame.closest(".ui-dialog");
                $(".qb-field-sel-tree",frame).fancytree( tree_opts ).on("mouseenter", ".fancytree-title", function(ev){
                    var node = $.ui.fancytree.getNode(ev);
                    node.setActive(true);
                });
            },
            close: function( ev, ui ) {
                dlg_inst.dialog("destroy").remove();
            }
        };

        frame.dialog( options );
    }

    _buildFieldSchema( a_props, a_out, a_refs ){
        var v, p;
        for ( var k in a_props ){
            v = a_props[k];
    
            if ( "$ref" in v ){
                a_out[k] = {};
                this._buildFieldSchema( a_refs[v["$ref"]].properties, a_out[k], a_refs );
            }else if (( p = v.properties ) != undefined ) {
                a_out[k] = {};
                this._buildFieldSchema( p, a_out[k], a_refs );
            }else{
                a_out[k] = v;
            }
        }
    }

    _buildFieldHTML(){
        this.sch_field_src = [];
        this._buildFieldHTMLRecurse( this._sch_fields, this.sch_field_src );
    }

    _buildFieldHTMLRecurse( a_fields, a_src ){
        var f;
        for ( var k in a_fields ){
            f = a_fields[k];
            if ( !f.type ){
                var chld = [];
                this._buildFieldHTMLRecurse( f, chld );
                a_src.push({ title: "<span title='"+(f.description?f.description:"(no description)")+"'>" + k + "</span>", folder: true, children: chld, key: k });

            }else{
                a_src.push({ title: "<span title='"+(f.description?f.description:"(no description)")+"'>" + k + "</span>", key: k });
            }
        }
    }
}


customElements.define( 'query-builder', QueryBuilder );