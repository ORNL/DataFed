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
    static _top_html = "<div class='group-div-header'><button class='group-btn-opr qb-btn-icon' title='Set group combination operator'>AND</button>\
        <button class='field-btn-add qb-btn-icon'><span class='ui-icon ui-icon-input' title='Add field'></span></button>\
        <button class='group-btn-add qb-btn-icon' title='Add sub-group'>( )</button></div>";
    static _grp_html = "<div class='group-div-header' style='cursor:move' draggable=true><button class='group-btn-opr qb-btn-icon' title='Set sub-group combination operator'>AND</button>\
        <button class='field-btn-add qb-btn-icon'><span class='ui-icon ui-icon-input' title='Add field'></span></button>\
        <button class='group-btn-add qb-btn-icon' title='Add sub-group'>( )</button>\
        <div style='float:right'><button class='group-btn-rem qb-btn-icon'><span class='ui-icon ui-icon-close' title='Remove this sub-group'></span></button></div></div>";
    static _fld_html = "<div class='qb-row-flex'>\
        <div style='flex:1 1 auto'>\
            <input class='field-inp-lh'></input>\
            <button class='field-btn-sel-lh qb-btn-icon'><span class='ui-icon ui-icon-list' title='Select field to evaluate'></button>\
            <span style='display:inline-block;display:none' class='qb-indent-wrap'>\
                <select class='field-sel-opr' disabled title='Choose field comparison operator'></select>\
                <input class='field-inp-rh'></input>\
                <button class='field-btn-val-type'>V</button><button class='field-btn-sel-rh qb-btn-icon' disabled><span class='ui-icon ui-icon-list' title='Select field to compare to'></span></button>\
            </span>\
        </div><div style='flex:none'>\
            <button class='field-btn-rem qb-btn-icon'><span class='ui-icon ui-icon-close' title='Remove this field'></span></button>\
        </div></div>";

    static _RH_VAL     = 1;
    static _RH_FLD     = 2;

    static _fld_cfg = {
        "string" : {label:"[str]", opr:[[OPR_EQ,3],[OPR_NEQ,3],[OPR_RGX,1],[OPR_WLD,1],[OPR_DF,0],[OPR_NDF,0]]},
        "number" : {label:"[num]", opr:[[OPR_EQ,3],[OPR_NEQ,3],[OPR_LT,3],[OPR_LTE,3],[OPR_GTE,3],[OPR_GT,3],[OPR_DF,0],[OPR_NDF,0]]},
        "integer": {label:"[int]", opr:[[OPR_EQ,3],[OPR_NEQ,3],[OPR_LT,3],[OPR_LTE,3],[OPR_GTE,3],[OPR_GT,3],[OPR_DF,0],[OPR_NDF,0]]},
        "enum"   : {label:"[enum]",opr:[[OPR_EQ,3],[OPR_NEQ,3],[OPR_DF,0],[OPR_NDF,0]]},
        "bool"   : {label:"[bool]",opr:[[OPR_TRU,0],[OPR_FAL,0],[OPR_EQ,2],[OPR_NEQ,2],[OPR_DF,0],[OPR_NDF,0]]},
        "array"  : {label:"[arr]", opr:[[OPR_CON,1],[OPR_DF,0],[OPR_NDF,0]]},
        "object" : {label:"[obj]", opr:[[OPR_DF,0],[OPR_NDF,0]]}
    }

    //static _fld_no_input = [OPR_TRU,OPR_FAL,OPR_DF,OPR_NDF];

    constructor(){
        super();

        this._sch = null;
        this._id = 1;
        this._state = {};
    }

    connectedCallback(){
        //console.log("query builder is on the page!")
        var inst = this,
            qb = $(this);

        this._ui_front = qb.closest(".ui-front");

        qb.on( "click", ".group-btn-add", ev => this._groupAddBtnClick( ev ));
        qb.on( "click", ".group-btn-rem", ev => this._groupRemBtnClick( ev ));
        qb.on( "click", ".group-btn-opr", ev => this._groupOpBtnClick( ev ));
        qb.on( "click", ".field-btn-add", ev => this._fieldAddBtnClick( ev ));
        qb.on( "click", ".field-btn-rem", ev => this._fieldRemBtnClick( ev ));
        qb.on( "click", ".field-btn-sel-lh", ev => this._fieldInputLHSelected( ev ));
        qb.on( "click", ".field-btn-val-type", ev => this._fieldInpTypeBtnClick( ev ));
        qb.on( "click", ".field-btn-sel-rh", ev => this._fieldInputRHSelected( ev ));
        qb.on( "selectmenuchange", ".field-sel-opr", (ev, ui) => this._fieldSelOperChangeEv( ev, ui ));

        qb.on( "dragstart", ".query-builder-group,.query-builder-field", ev => this._handleDragStart( ev ));
        qb.on( "dragenter", ".query-builder-group,.query-builder-field", ev => this._handleDragEnter( ev ));
        qb.on( "dragleave", ".query-builder-group,.query-builder-field", ev => this._handleDragLeave( ev ));
        qb.on( "dragover", ".query-builder-group,.query-builder-field", ev => this._handleDragOver( ev ));
        qb.on( "drop", ".query-builder-group,.query-builder-field", ev => this._handleDragDrop( ev ));
        qb.on( "dragend", ".query-builder-group,.query-builder-field", ev => this._handleDragEnd( ev ));

        qb.on( "input", ".field-inp-lh", ev => this._fieldInputLHChanged( ev.currentTarget, true ));
        qb.on( "blur", ".field-inp-lh", ev => this._fieldInputLHChanged( ev.currentTarget, false ));
        qb.on( "keydown", ".field-inp-lh", function( ev ){
            if ( ev.keyCode == 13 ){
                inst._fieldInputLHChanged( ev.currentTarget, false );
            }
        });

        qb.on( "input", ".field-inp-rh", ev => this._fieldValidateRH( $(ev.currentTarget), true ));
        qb.on( "blur", ".field-inp-rh", ev => this._fieldValidateRH( $(ev.currentTarget), false ));
        qb.on( "keydown", ".field-inp-rh", function( ev ){
            if ( ev.keyCode == 13 ){
                inst._fieldValidateRH( $(ev.currentTarget), false );
            }
        });
    }

    disconnectedCallback(){
    }

    init( a_schema, a_query ){
        this._sch = a_schema;
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
        this._fieldAdd( grp );

        this._front = grp.closest(".ui-front");
    }

    getSchema(){
        return this._sch;
    }

    hasErrors(){
        return $( ".qb-error", this._top_grp ).length?true:false;
    }

    getQuery(){
        if ( this.hasErrors() ){
            return;
        }

        return this._getQueryRecurse( this._top_grp[0] );
    }

    _getQueryRecurse( div ){
        if ( div.classList.contains("query-builder-group")){
            var ch = [], q;

            for ( var i = 0; i < div.children.length; i++ ){
                q = this._getQueryRecurse( div.children[i] );
                if ( q ){
                    ch.push( q );
                }
            }

            return {
                type: "group",
                op: $(".group-btn-opr", div ).button('option', 'label').toLowerCase(),
                children: ch
            };
        }else if ( div.classList.contains("query-builder-field")){
            var qry = {
                type: "field",
                lh: $(".field-inp-lh", div ).val(),
                op: $(".field-sel-opr", div ).val()
            };

            if ( this._state[div.id].opr[1] ){
                qry.rh = $(".field-inp-rh", div ).val();
                qry.rh_is_field = ($(".field-btn-val-type",div).button( "option", "label" ) == "F"?true:false);
            }

            return qry;
        }
    }

    _handleDragStart( ev ){
        $(".query-builder-field *", this._top_grp ).addClass("qb-no-ptr-ev");
        $(".group-div-header *", this._top_grp ).addClass("qb-no-ptr-ev");

        ev.originalEvent.dataTransfer.effectAllowed = 'move';
        this._drag_src = ev.currentTarget;

        ev.stopPropagation();
    }

    _handleDragEnter( ev ){
        if ( ev.target.classList.contains( "query-builder-field" ) || ev.target.classList.contains( "group-div-header" )){
            ev.target.classList.add( "qb-drop-target" );
            ev.stopPropagation();
        }
    }

    _handleDragLeave( ev ){
        if ( ev.target.classList.contains( "query-builder-field" ) || ev.target.classList.contains( "group-div-header" )){
            ev.target.classList.remove( "qb-drop-target" );
            ev.stopPropagation();
        }
    }

    _handleDragOver( ev ){
        if ( ev.target.classList.contains( "query-builder-field" ) || ev.target.classList.contains( "group-div-header" )){
            ev.stopPropagation();
            ev.preventDefault();
        }
    }

    _handleDragDrop( ev ){
        if ( ev.currentTarget.classList.contains( "query-builder-group" )){
            ev.currentTarget.firstChild.classList.remove( "qb-drop-target" );
            ev.currentTarget.insertBefore( this._drag_src, ev.currentTarget.firstChild.nextSibling );
        }else{
            ev.currentTarget.classList.remove( "qb-drop-target" );

            var y = ev.pageY - $(ev.currentTarget).offset().top;

            if ( y > ev.currentTarget.clientHeight / 2 ){
                ev.currentTarget.parentNode.insertBefore( this._drag_src, ev.currentTarget.nextSibling );
            }else{
                ev.currentTarget.parentNode.insertBefore( this._drag_src, ev.currentTarget );
            }
        }

        ev.stopPropagation();
        ev.preventDefault();
        return false;
    }

    _handleDragEnd(){
        $(".query-builder-field *", this._top_grp ).removeClass("qb-no-ptr-ev");
        $(".group-div-header *", this._top_grp ).removeClass("qb-no-ptr-ev");
        this._drag_src = null;
    }

    _groupAdd( a_container ){
        var grp = document.createElement('div');
        grp.id = "qb-grp-" + this._id++;

        grp.setAttribute('class','query-builder-group');
        grp.innerHTML = QueryBuilder._grp_html;
        $("button",grp).button();

        a_container.append( grp );
        this._fieldAdd( grp );
    }

    _fieldAdd( a_container ){
        var fld = document.createElement('div');
        fld.id = "qb-fld-" + this._id++;

        fld.setAttribute('class','query-builder-field');
        fld.setAttribute('draggable','true');
        fld.innerHTML = QueryBuilder._fld_html;
        a_container.append( fld );
        $("button",fld).button();
        util.inputTheme( $(".field-inp-lh, .field-inp-rh",fld));
        $("select",fld).selectmenu({ width: false });

        this._fieldInputLHValidate( fld );
    }

    _groupAddBtnClick( ev ){
        var div = ev.currentTarget.closest("div.query-builder-group");
        this._groupAdd( div );
    }

    _groupRemBtnClick( ev ){
        var div = ev.currentTarget.closest("div.query-builder-group");
        if ( div ){
            // Work around close bug in jquery-ui tooltip
            $(".ui-tooltip",this._front).remove();
            div.remove();
        }
    }

    _groupOpBtnClick( ev ){
        if ( ev.currentTarget.innerText == "AND" ){
            $(ev.currentTarget).button('option', 'label', 'OR');
        }else{
            $(ev.currentTarget).button('option', 'label', 'AND');
        }
    }

    _fieldAddBtnClick( ev ){
        var div = ev.currentTarget.closest("div.query-builder-group");

        this._fieldAdd( div );
    }

    _fieldRemBtnClick( ev ){
        var div = ev.currentTarget.closest("div.query-builder-field");
        if ( div ){
            // Work around close bug in jquery-ui tooltip
            $(".ui-tooltip",this._front).remove();
            div.remove();
        }
    }

    _fieldInputLHSelected( ev ){
        var inst = this;
        this._selectSchemaField( ev.currentTarget, null, null, function( field ){
            var div = ev.currentTarget.closest(".query-builder-field");

            inst._fieldInputLHValidate( div, field );
        })
    }

    _fieldInputLHChanged( target, delay ){
        var div = target.closest(".query-builder-field"),
            id = div.id,
            st;

        if ( id in this._state ){
            st = this._state[id];
        }else{
            st = { inp_tm: null };
            this._state[id] = st;
        }

        if ( st.inp_tm ){
            clearTimeout( st.inp_tm );
            st.inp_tm = null;
        }

        if ( delay ){
            var inst = this;
            st.inp_tm = setTimeout( function(){ inst._fieldInputLHChanged( target, false ); }, 2000 );
        }else{
            st.inp_tm = null;

            this._fieldInputLHValidate( div );
        }
    }

    _fieldInputLHValidate( div, field ){
        var i, target = $(".field-inp-lh",div);

        if ( !field ){
            var val = target.val().trim();

            console.log("inp val",val);

            if ( !val.length ){
                target.addClass( "qb-error" );
                target.attr( "title", "Input or select a schema field." );
            }else{
                var path = val.split( "." ),
                    flds = this._sch_fields;

                for ( i in path ){
                    if ( typeof flds === "object" && path[i] in flds ){
                        flds = flds[path[i]];
                    }else{
                        target.addClass( "qb-error" );
                        target.attr( "title", "Invalid schema field." );
                        flds = null;
                        break;
                    }
                }

                console.log("input val/field",val,field );
                field = flds;
                if ( field ){
                    field.path = val;
                    // TODO This is not right - need to handle arrays, enums?
                    if ( !field.type ){
                        field.type = "object";
                        field.description = "(no description)";
                    }
                }
            }
        }

        var st;

        if ( div.id in this._state ){
            st = this._state[div.id];
        }else{
            st = {}
            this._state[div.id] = st;
        }

        console.log("field:",field);

        // No valid field selected, remove RH inputs, reset field state (not inpt timer)
        if ( !field ){
            st.lh = null;
            st.rh = null;
            $(".qb-indent-wrap",div).hide();
        }else{
            st.lh = field;
            target.val( field.path );
            target.removeClass( "qb-error" );
            target.attr( "title", field.path + " : " + QueryBuilder._fld_cfg[field.type].label + " " + field.description );

            // Update select menu items
            var oper = QueryBuilder._fld_cfg[field.type].opr,
                sel = $(".field-sel-opr",div),
                html = "";

            for ( i in oper ){
                html += "<option>" + oper[i][0] + "</option>";
            }

            sel.html( html );
            sel.selectmenu("enable");
            sel.selectmenu("refresh");

            this._fieldSelOperChange( div, oper[0][0] );
            this._fieldValidateRH( $(".field-inp-rh",div), false );
    
            $(".qb-indent-wrap",div).show();
        }
    }


    _fieldSelOperChangeEv( ev, ui ){
        var div = ev.currentTarget.closest(".query-builder-field");

        this._fieldSelOperChange( div, ui.item.value );
    }

    _fieldSelOperChange( div, value ){
        var id = div.id;

        if ( id in this._state ){
            var st = this._state[id],
                fc = QueryBuilder._fld_cfg[st.lh.type];

            for ( var i in fc.opr ){
                if ( value == fc.opr[i][0] ){
                    st.opr = fc.opr[i];
                    if ( st.opr[1] ){
                        var btn_vt = $(".field-btn-val-type",div);

                        if ( st.opr[1] & QueryBuilder._RH_VAL ){
                            btn_vt.button("enable");
                        }else{
                            btn_vt.button("disable").button('option', 'label', 'F');
                        }
                        
                        if ( st.opr[1] & QueryBuilder._RH_FLD ){
                            if ( btn_vt.button( "option", "label" ) == "F" ){
                                $(".field-btn-sel-rh",div).button("enable");
                            }else{
                                $(".field-btn-sel-rh",div).button("disable");
                            }
                        }else{
                            btn_vt.button("disable").button('option', 'label', 'V');
                            $(".field-btn-sel-rh",div).button("disable");
                        }

                        $(".field-inp-rh, .field-btn-val-type, .field-btn-sel-rh",div).show();
                    }else{
                        $(".field-inp-rh, .field-btn-val-type, .field-btn-sel-rh",div).hide();
                    }
                    return;
                }
            }
            console.log("oops, not found:", fc.opr );
        }
    }

    _fieldInpTypeBtnClick( ev ){
        var div = ev.currentTarget.closest(".query-builder-field");
        if ( ev.currentTarget.innerText == "V" ){
            $(ev.currentTarget).button('option', 'label', 'F');
            $(".field-btn-sel-rh",div).button("enable");
        }else{
            $(ev.currentTarget).button('option', 'label', 'V');
            $(".field-btn-sel-rh",div).button("disable");
        }
        this._fieldValidateRH( $(".field-inp-rh",div), false );
    }

    _fieldInputRHSelected( ev ){
        var inst = this,
            div = ev.currentTarget.closest(".query-builder-field"),
            st = this._state[div.id];

        this._selectSchemaField( ev.currentTarget, st.lh.type, st.lh.path, function( field ){
            console.log("selected:", field );

            var inp = $(".field-inp-rh",div);

            inp.val( field.path );
            inp.removeClass( "qb-error" );
            inp.attr("title", field.path + " : " + QueryBuilder._fld_cfg[field.type].label + " " + field.description );

            inst._state[div.id].rh = field;
        })
    }

    _fieldValidateRH( inp, delay ){
        var div = inp.closest(".query-builder-field"),
            id = div[0].id,
            st;

        if ( id in this._state ){
            st = this._state[id];
        }else{
            st = { inp_rh_tm: null };
            this._state[id] = st;
        }

        if ( st.inp_rh_tm ){
            clearTimeout( st.inp_rh_tm );
            st.inp_rh_tm = null;
        }

        if ( delay ){
            var inst = this;
            st.inp_rh_tm = setTimeout( function(){ inst._fieldValidateRH( inp, false ); }, 2000 );
        }else{
            st.inp_rh_tm = null;

            if ( !st.lh )
                return;

            var val = inp.val().trim(),
                vt = $(".field-btn-val-type",div).text();

            if ( vt == "V" ){
                if ( !val.length ){
                    inp.addClass("qb-error");
                    inp.attr("title", "A value must specified." );
                    return;
                }else if( st.lh.type == "integer" ){
                    if ( isNaN( util.strToIntStrict( val )) ){
                        inp.addClass("qb-error");
                        inp.attr("title", "Value must be an integer." );
                        return;
                    }
                }else if( st.lh.type == "number" ){
                    if ( isNaN( util.strToNumStrict( val )) ){
                        inp.addClass("qb-error");
                        inp.attr("title", "Value must be a number." );
                        return;
                    }
                }

                inp.attr("title", "" );
            }else{
                var path = val.split("."),
                    flds = this._sch_fields;

                if ( !val.length ){
                    inp.removeClass("qb-error");
                    inp.attr("title", "" );
                    return;
                }

                for ( var i in path ){
                    if ( typeof flds === "object" && path[i] in flds ){
                        flds = flds[path[i]];
                    }else{
                        inp.addClass("qb-error");
                        inp.attr("title", "Invalid schema field." );
                        return;
                    }
                }

                st.rh = flds;

                if ( !this._typeCompat( st.lh.type, st.rh.type )){
                    inp.addClass( "qb-error" );
                    inp.attr( "title", "Field type (" + st.lh.type + ") not compatible with left-hand field type (" + st.rh.type + ")." );
                    return;
                }

                inp.attr("title", val + " : " + QueryBuilder._fld_cfg[flds.type].label + " " + flds.description );
            }

            inp.removeClass("qb-error");
        }
    }

    _typeCompat( a, b ){
        if ( a == b || ( a == "integer" && b == "number" ) || ( b == "integer" && a == "number" )){
            return true;
        }else{
            return false;
        }
    }

    _selectSchemaField( a_target, a_type, a_excl, a_cb ){
        var frame = $(document.createElement('div')),
            dlg_inst,
            inst = this;

        frame.html("<div class='qb-field-sel-tree no-border'></div>");

        function dlgSubmit( a_node ){
            if ( a_cb ){
                var node = a_node?a_node:tree.getSelectedNodes()[0];

                a_cb({ path: node.key, description: node.data.desc, type: node.data.val_type });
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
                if ( data.targetType == "expander" && data.node.isFolder() ){
                    data.node.toggleExpanded();
                }else if ( !data.node.unselectable ){
                    dlgSubmit( data.node );
                }
            },
            init: function( ev, data ){
                if ( a_type ){
                    data.tree.rootNode.visit( function( node ){
                        //console.log("node:",node,"ty:",a_type);
                        if ( a_type && !inst._typeCompat( node.data.val_type, a_type )){
                            //console.log("unselect",node.data.val_type );
                            node.unselectable = true;
                            node.addClass("qb-tree-disabled");
                        }
                    });
                }

                if ( a_excl ){
                    var nd = data.tree.getNodeByKey( a_excl );

                    if ( nd ){
                        nd.unselectable = true;
                        nd.addClass("qb-tree-disabled");
                    }
                }

                data.tree.rootNode.children[0].setActive( true );
            }
        };

        var options = {
            title: "Select Schema Field",
            modal: true,
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
                //frame_outer = frame.closest(".ui-dialog");
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
        this._buildFieldHTMLRecurse( this._sch_fields, null, this.sch_field_src );
    }

    _buildFieldHTMLRecurse( a_fields, a_path, a_src ){
        var f, p;
        for ( var k in a_fields ){
            f = a_fields[k];
            p = (a_path?a_path + ".":"") + k;
            //console.log("field", k, f);
            if ( !f.type ){
                var chld = [];
                this._buildFieldHTMLRecurse( f, p, chld );
                a_src.push({ title: "<span title='"+(f.description?f.description:"(no description)")+"'>" + k + "</span>", folder: true, children: chld, key: p, val_type: "object", desc: (f.description?f.description:"(no description)") });
            }else{
                a_src.push({ title: "<span title='"+(f.description?f.description:"(no description)")+"'>" + k + "</span>", key: p, val_type: f.type, desc: (f.description?f.description:"(no description)") });
            }
        }
    }
}


customElements.define( 'query-builder', QueryBuilder );