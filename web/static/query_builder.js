import * as util from "./util.js";

export const OPR_AND     = "and";
export const OPR_OR      = "or";
export const OPR_LT      = "<";
export const OPR_LTE     = "<=";
export const OPR_EQ      = "==";
export const OPR_NEQ     = "!=";
export const OPR_GTE     = ">=";
export const OPR_GT      = ">";
export const OPR_DF      = "is defined";
export const OPR_NDF     = "is omitted";
export const OPR_RGX     = "regex";
export const OPR_WLD     = "pattern";
export const OPR_TRU     = "is true";
export const OPR_FAL     = "is false";
export const OPR_CON     = "contains";

export class QueryBuilder extends HTMLElement {
    static _top_html = "<button class='group-btn-opr qb-btn-icon' title='Set group combination operator'>AND</button>\
        <button class='field-btn-add qb-btn-icon'><span class='ui-icon ui-icon-input' title='Add field'></span></button>\
        <button class='group-btn-add qb-btn-icon' title='Add sub-group'>( )</button>";
    static _grp_html = "<button class='group-btn-opr qb-btn-icon' title='Set sub-group combination operator'>AND</button>\
        <button class='field-btn-add qb-btn-icon'><span class='ui-icon ui-icon-input' title='Add field'></span></button>\
        <button class='group-btn-add qb-btn-icon' title='Add sub-group'>( )</button>\
        <div style='float:right'><button class='group-btn-rem qb-btn-icon'><span class='ui-icon ui-icon-close' title='Remove this sub-group'></span></button></div>";
    static _fld_html = "<div class='qb-row-flex'>\
        <div style='flex:1 1 auto'>\
            <button class='field-btn-sel-lh'>Select Field...</button>\
            <span class='field-type-label'></span>\
            <span style='display:inline-block;display:none' class='qb-indent-wrap'>\
                <select class='field-sel-opr' disabled title='Choose field comparison operator'></select>\
                <button class='field-btn-val-type'>VAL</button>\
                <input class='field-inp-val'></input>\
                <button class='field-btn-sel-rh qb-btn-icon' disabled><span class='ui-icon ui-icon-list' title='Select field to compare to'></span></button>\
            </span>\
        </div><div style='flex:none'>\
            <button class='field-btn-rem qb-btn-icon'><span class='ui-icon ui-icon-close' title='Remove this field'></span></button>\
        </div></div>";

    static _FLD_STR     = 1;
    static _FLD_NUM     = 2;
    static _FLD_BOOL    = 3;
    static _FLD_ARR     = 4;
    static _FLD_OBJ     = 5;

    static _fld_cfg = {
        "string": {label:"[str]",opr:[OPR_EQ,OPR_NEQ,OPR_RGX,OPR_WLD,OPR_DF,OPR_NDF]},
        "number": {label:"[num]",opr:[OPR_EQ,OPR_NEQ,OPR_LT,OPR_LTE,OPR_GTE,OPR_GT,OPR_DF,OPR_NDF]},
        "integer": {label:"[int]",opr:[OPR_EQ,OPR_NEQ,OPR_LT,OPR_LTE,OPR_GTE,OPR_GT,OPR_DF,OPR_NDF]},
        "bool"  : {label:"[bool]",opr:[OPR_TRU,OPR_FAL,OPR_EQ,OPR_NEQ,OPR_DF,OPR_NDF]},
        "array" : {label:"[arr]",opr:[OPR_CON,OPR_DF,OPR_NDF]},
        "object": {label:"[obj]",opr:[OPR_DF,OPR_NDF]}
    }

    static _fld_no_input = [OPR_TRU,OPR_FAL,OPR_DF,OPR_NDF];

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

        $(this).on( "click", ".group-btn-add", ev => this._groupAddBtnClick( ev ));
        $(this).on( "click", ".group-btn-rem", ev => this._groupRemBtnClick( ev ));
        $(this).on( "click", ".group-btn-opr", ev => this._groupOpBtnClick( ev ));
        $(this).on( "click", ".field-btn-add", ev => this._fieldAddBtnClick( ev ));
        $(this).on( "click", ".field-btn-rem", ev => this._fieldRemBtnClick( ev ));
        $(this).on( "click", ".field-btn-sel-lh", ev => this._fieldSelectBtnClick( ev ));
        $(this).on( "click", ".field-btn-val-type", ev => this._fieldInpTypeBtnClick( ev ));
        $(this).on( "click", ".field-btn-sel-rh", ev => this._fieldSelRHBtnClick( ev ));
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
        grp.style.margin = "0";
        grp.innerHTML = QueryBuilder._top_html;
        $("button",grp).button();
        this._top_grp = $(grp)
        util.tooltipTheme( this._top_grp );

        this.append( grp );

        this._front = grp.closest(".ui-front");
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
        util.inputTheme( $(".field-inp-val",fld));

        $("select",fld).selectmenu({
            width:false,
            change: function( ev, ui ){
                console.log("sel",ui.item);
                if ( QueryBuilder._fld_no_input.indexOf( ui.item.value ) == -1 ){
                    // Show input
                    $(".field-inp-val, .field-btn-val-type, .field-btn-sel-rh",fld).show();
                    
                }else{
                    // Hide input
                    $(".field-inp-val, .field-btn-val-type, .field-btn-sel-rh",fld).hide();
                }
            }
        });
    }

    _groupAddBtnClick( ev ){
        console.log("group add");
        var div = ev.currentTarget.closest("div.query-builder-group");
        this._groupAdd( div );
    }

    _groupRemBtnClick( ev ){
        console.log("group rem");
        var div = ev.currentTarget.closest("div.query-builder-group");
        if ( div ){
            // Work around close bug in jquery-ui tooltip
            $(".ui-tooltip",this._front).remove();
            div.remove();
        }
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
        if ( div ){
            // Work around close bug in jquery-ui tooltip
            $(".ui-tooltip",this._front).remove();
            div.remove();
        }
    }

    _fieldSelectBtnClick( ev ){
        this._selectSchemaField( ev.currentTarget, function( field ){
            console.log("selected:", field );

            var btn = $(ev.currentTarget),
                div = btn.closest(".query-builder-field"),
                sel = $(".field-sel-opr",div),
                val = $(".field-inp-val",div);

            btn.button("option","label", field.label.length > 20?"..." + field.label.substr(field.label.length-20):field.label );
            btn.attr("title", field.label + " : " + field.desc );
            util.tooltipTheme( btn );

            $(".field-type-label",div).text(QueryBuilder._fld_cfg[field.type].label);

            var oper = QueryBuilder._fld_cfg[field.type].opr,
                html = "";

            for ( var i in oper ){
                html += "<option>" + oper[i] + "</option>";
            }
            console.log("sel opt:",html);
            sel.html( html );
            sel.selectmenu("enable");
            sel.selectmenu("refresh");

            val.show();
            $(".qb-indent-wrap",div).show();
        })
    }

    _fieldInpTypeBtnClick( ev ){
        var div = ev.currentTarget.closest(".query-builder-field");
        if ( ev.currentTarget.innerText == "VAL" ){
            $(ev.currentTarget).button('option', 'label', 'FLD');
            $(".field-btn-sel-rh",div).button("enable");
        }else{
            $(ev.currentTarget).button('option', 'label', 'VAL');
            $(".field-btn-sel-rh",div).button("disable");
        }
    }

    _fieldSelRHBtnClick( ev ){
        this._selectSchemaField( ev.currentTarget, function( field ){
            console.log("selected:", field );

            var btn = $(ev.currentTarget),
                div = btn.closest(".query-builder-field"),
                val = $(".field-inp-val",div);

            val.val( field.label );

            //btn.button("option","label", field.label.length > 20?"..." + field.label.substr(field.label.length-20):field.label );
            //btn.attr("title", field.label + " : " + field.desc );
            //util.tooltipTheme( btn );

            //$(".field-type-label",div).text(QueryBuilder._fld_cfg[field.type].label);

            /*var oper = QueryBuilder._fld_cfg[field.type].opr,
                html = "";

            for ( var i in oper ){
                html += "<option>" + oper[i] + "</option>";
            }
            console.log("sel opt:",html);
            sel.html( html );
            sel.selectmenu("enable");
            sel.selectmenu("refresh");

            val.show();
            $(".qb-indent-wrap",div).show();
            */
        })
    }

    _selectSchemaField( a_target, a_cb ){
        var frame = $(document.createElement('div')),
            frame_outer,
            dlg_inst;

        frame.html("<div class='qb-field-sel-tree no-border'></div>");

        function dlgSubmit( a_node ){
            if ( a_cb ){
                var node = a_node?a_node:tree.getSelectedNodes()[0],
                    path = [node.key],
                    label = node.key,
                    desc = node.data.desc,
                    val_ty = node.data.val_type;

                while ( node.parent.parent ){
                    node = node.parent;
                    path.unshift( node.key );
                    label = node.key + "." + label;
                }
                //console.log("node:",a_node);
                a_cb({ path: path, label: label, desc: desc, type: val_ty });
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
                /*if ( data.node.isFolder() )
                    $("#ok_btn",frame_outer).button("disable");
                else
                    $("#ok_btn",frame_outer).button("enable");*/
            },
            keydown:function( ev, data ) {
                if ( ev.keyCode == 13 /*&& !data.node.isFolder()*/ ){
                    dlgSubmit( data.node );
                }
            },
            click:function( ev, data ) {
                console.log("click",ev,data);
                //if ( !data.node.isFolder() ){
                if ( data.targetType == "expander" && data.node.isFolder() ){
                    data.node.toggleExpanded();
                }else{
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
            /*buttons: [{
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
            }],*/
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
            console.log("field", k, f);
            if ( !f.type ){
                var chld = [];
                this._buildFieldHTMLRecurse( f, chld );
                a_src.push({ title: "<span title='"+(f.description?f.description:"(no description)")+"'>" + k + "</span>", folder: true, children: chld, key: k, val_type: "object", desc: (f.description?f.description:"(no description)") });
            }else{
                a_src.push({ title: "<span title='"+(f.description?f.description:"(no description)")+"'>" + k + "</span>", key: k, val_type: f.type, desc: (f.description?f.description:"(no description)") });
            }
        }
    }
}


customElements.define( 'query-builder', QueryBuilder );