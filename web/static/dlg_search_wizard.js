/*jshint multistr: true */

// TODO - This is not currently used - placeholder only

function dlgSearchWizard( a_cb ) {
    if ( !a_cb ){
        console.log("search wiz invalid cb");
        return;
    }

    var frame = $(document.createElement('div'));
    frame.html("<div id='search-wiz-tabs' style='border:none;padding:0'>\
        <ul>\
            <li><a href='#tab-srch-basic'>Basic Search</a></li>\
            <li><a href='#tab-srch-adv'>Advanced Search</a></li>\
        </ul>\
        <div id='tab-srch-basic' style='overflow:auto;height:100%;min-height:0'>\
            Full-text match:<hr>\
            <table style='width:30em'>\
            <tr><td>Title:</td><td style='width:100%'><input style='width:100%' id='ft_title' type='text'></input></td></tr>\
            <tr><td>Description:</td><td style='width:100%'><input style='width:100%' id='ft_desc' type='text'></input></td></tr>\
            <tr><td>Keywords:</td><td style='width:100%'><input style='width:100%' id='ft_keyw' type='text'></input></td></tr>\
            </table><br>\
            Match <b>all</b> of these terms:<button style='float:right' id='add_term1' class='btn small'>Add</button><hr>\
            <div id='terms1'></div><br>\
            Match <b>any</b> of these terms:<button style='float:right' id='add_term2' class='btn small'>Add</button><hr>\
            <div id='terms2'></div>\
        </div>\
        <div id='tab-srch-adv' style='overflow:auto;height:100%;min-height:0'>\
            Full-text match:<hr>\
            <table style='width:30em'>\
            <tr><td>Title:</td><td style='width:100%'><input style='width:100%' id='ft_adv_title' type='text'></input></td></tr>\
            <tr><td>Description:</td><td style='width:100%'><input style='width:100%' id='ft_adv_desc' type='text'></input></td></tr>\
            <tr><td>Keywords:</td><td style='width:100%'><input style='width:100%' id='ft_adv_keyw' type='text'></input></td></tr>\
            </table><br>\
            Search clauses:<button style='float:right' id='add_clause' class='btn small'>Add</button><hr>\
            <div id='clauses'></div>\
        </div>\
        ");

    var valid_terms = ["title","desc","alias","owner","keywords","topic","size","ct","ut"];
    var autocomp_terms = ["title","desc","alias","owner","keywords","topic","size","ct","ut","md."];

    var cur_term = null;
    $(".btn",frame).button();
    inputTheme($( "input[type='text']",frame));

    var terms1div = $("#terms1",frame);
    var terms2div = $("#terms2",frame);
    var clauses = $("#clauses",frame);

    $("#add_term1",frame).on("click",function(){
        addTerm(terms1div);
    });

    $("#add_term2",frame).on("click",function(){
        addTerm(terms2div);
    });

    $("#add_clause",frame).on("click",function(){
        addClause();
    });

    frame.on("click",".add-term",function( ev ){
        console.log("add term, this", this, "ev", ev );
        addTerm( $(this).nextAll("div") );
    });

    frame.on("click", ".remove-btn", function( ev ){
        removeTerm( $(this) );
    });

    frame.on("click", ".pick-term-btn", function( ev ){
        //console.log("pick term btn", $(this), ev);
        cur_term = $(this).parent();
        $("#termmenu").toggle().position({
            my: "right top",
            at: "right top",
            of: this
        });
    });

    function addClause(){
        var clause = $("<div>Search clause<button style='float:right' class='btn small add-term'>Add Term</button><hr><div class='wtf'></div></div>").appendTo( clauses );
        console.log("addClause, new child:", $(".wtf",clause ) );
        addTerm( $(".wtf",clause ));
    }

    function setTerm( value, focus ){
        //console.log("setTerm",cur_term);
        var input = $( ".term-input", cur_term );
        input.val( value );
        if ( focus )
            input.focus();
    }

    function addTerm( target ){
        console.log("addTerm", target );
        var child = target.append("<div class='req-term' style='padding:.25em 0'><input title='Search term' class='term-input' type='text'></input><button tabindex='-1' class='btn small drop pick-term-btn'><span class='ui-icon ui-icon-triangle-1-s'></span></button>\
        <select><option value='=='>=</option><option value='!='>!=</option><option value='&lt;'>&lt</option><option value='&lt;='>&lt;=</option><option value='&gt;='>&gt;=</option><option value='&gt;'>&gt;</option><option title='Pattern match' value='?'>Pattern</option><option title='Regular expression' value='=~'>Regex</option><option title='Defined' value='def'>Defined</option><option title='Undefined' value='undef'>!Defined</option></select>\
        <input title='Value to match' type='text'></input>\
        <button class='btn small remove-btn '><span class='ui-icon ui-icon-close' style='color:red'></span></button>\
        </div>");
        var inp = $( ".term-input", child );
        inp.autocomplete({
            source: autocomp_terms,
            delay:100,
            autoFocus: true,
            select: function(event, ui) {
                this.value = ui.item.value;
                if ( this.value == "md." ){
                    event.preventDefault();
                    inp.focus();
                }
            }
        });

        $( ".btn", child ).button();
        $( "select", child ).selectmenu({
            width:false,
            classes:{"ui-selectmenu-button":"search-wiz-select-button"},
            select: function( ev, ui ){
                //console.log("select",ev,ui);
                var controls = $(this).parent().children();
                if ( ui.item.value == "def" || ui.item.value == "undef" ){
                    //$(controls[4]).val("").prop("disabled","true");
                    inputDisable($(controls[4])).val("");

                }else{
                    inputEnable($(controls[4]));
                    //$(controls[4]).val("").prop("disabled","false");
                }
            }
        });
        inputTheme($( "input", child ));
    }
    
    function clearTerm( div ){
        var children = div.children();
        $(children[0]).val("").focus();
        $(children[2]).val("==").selectmenu("refresh");
        $(children[4]).val("");
    }

    function removeTerm( target ){
        var children = target.parent().parent().children("div");
        if ( children.length > 1 ){
            var foc = target.parent().prev().length?target.parent().prev():target.parent().next();
            console.log("focus:",foc);
            foc.children()[0].focus();
            target.parent().remove();
        }else{
            clearTerm( target.parent() );
        }
    }

    function parseTerms( div ){
        var children = div.children();
        //console.log("children",children);
        var term = $(children[0]).val().trim();
        var op = $(children[2]).val();
        var val = $(children[4]).val().trim();

        if ( !term && !val )
            return null;

        if ( !term )
            throw "Search term cannot be empty";

        if ( valid_terms.indexOf( term ) == -1 && (term.length < 4 || !term.startsWith("md.")))
            throw "Invalid search term: " + term;

        var res = term;

        if ( op == "def" )
            res += " != null";
        else if ( op == "undef" )
            res += " == null";
        else{
            if ( !val )
                throw "Search value cannot be empty";
            var c1 = val.charAt(0);
            var c2 = val.charAt(val.length-1);
            // If no quotes, try to guess if they are needed or not
            if ( c1 == '\"' || c2 == '\"' || c1 == '\'' || c2 == '\'' ){
                if ( c1 != c2 )
                    throw "Unterminated quotation marks in value: " + val;
            }else{
                if ( val != "true" && val != "false" && val != "null" && !val.startsWith("md.")){
                    var n = Number( val );
                    //console.log("n:",n);
                    if ( isNaN( n )){
                        //console.log("term",term);
                        if ( term == "ct" || term == "ut" ){
                            //console.log("is ctime");
                            n = new Date( val );
                            //console.log("n1:",n);
                            n = n.getTime();
                            //console.log("n2:",n);
                            if ( !isNaN( n ))
                                val = n/1000;
                            else
                                val = "\"" + val + "\"";
                        }else
                            val = "\"" + val + "\"";
                    }
                }
            }

            res += " " + op + " " + val;
        }

        return res;
    }

    var options = {
        dialogClass: 'dlg-no-title',
        title: "Search Wizard",
        modal: false,
        width: "auto",
        height: 550,
        resizable: false,
        draggable: false,
        buttons: [{
            text: "Cancel",
            click: function() {
                $(this).dialog('close');
            }
        },{
            text: "Search",
            click: function() {
                //var scope = SS_MY_DATA | SS_MY_PROJ;
                var i,qry1="",qry2="",p;
                var terms1 = $("#terms1 > div",frame);
                var terms2 = $("#terms2 > div",frame);

                try{
                    if ( terms1.length ){
                        for ( i = 0; i < terms1.length; i++ ){
                            p = parseTerms( $( terms1[i] ));
                            if ( p ){
                                if ( qry1 ) qry1 += " && ";
                                qry1 += p;
                            }
                        }
                    }

                    if ( terms2.length ){
                        for ( i = 0; i < terms2.length; i++ ){
                            p = parseTerms( $( terms2[i] ));
                            if ( p ){
                                if ( qry2 ) qry2 += " || ";
                                qry2 += p;
                            }
                        }
                    }

                    if ( qry1 && qry2 )
                        qry = "(" + qry1 + ") && (" + qry2 + ")";
                    else
                        qry = qry1?qry1:qry2;

                    //console.log( "query:", qry );

                    a_cb( qry );
                    $(this).dialog('close');
                }catch(e){
                    dlgAlert("Input Error", e );
                }
            }
        }],
        open: function(ev,ui){
            //console.log( "dlg open", $(this) );
            var dlg_frame = $(this).parent().parent();
            dlg_frame.append(
                "<ul id='termmenu' class='ui-state-hover' style='display:none;z-index:1000;width:13ch;padding:.25em'>\
                    <li><div id='set_title'>Title</div></li>\
                    <li><div id='set_desc'>Description</div></li>\
                    <li><div id='set_topic'>Topic</div></li>\
                    <li><div id='set_owner'>Owner</div></li>\
                    <li><div id='set_alias'>Alias</div></li>\
                    <li><div id='set_size'>Data&nbsp;Size</div></li>\
                    <li><div id='set_ctime'>Create&nbsp;Time</div></li>\
                    <li><div id='set_utime'>Update&nbsp;Time</div></li>\
                    <li><div id='set_md'>Metadata</div></li>\
                </ul>");

            $("#search-wiz-tabs",frame).tabs({heightStyle:"fill"});

            terms1div.on("keydown",function(e){
                console.log("keydown",e);
                if ( handleHotKey(e,terms1div)){
                    e.preventDefault();
                    return false;
                }
            });
            terms2div.on("keydown",function(e){
                if ( handleHotKey(e,terms2div)){
                    e.preventDefault();
                    return false;
                }
            });

            function handleHotKey( ev, context ){
                if (ev.ctrlKey){
                    switch( ev.keyCode ) {
                        case 107: // + = add
                            addTerm(context);
                            return true;
                        case 109: // - = Remove
                            removeTerm( $(ev.target) );
                            //if ( context.children("div").length > 1 ){
                            //    $(ev.target).parent().remove();
                            return true;
                        case 82: // R = Reset
                            clearTerm( $(ev.target).parent() );
                            return true;
                    }
                }
                return false;
            }

            var termmenu = $("#termmenu",dlg_frame);
            termmenu.menu();

            var menutimer = null;

            termmenu.mouseout(function(){
                if ( !menutimer ){
                    menutimer = setTimeout( function(){
                        termmenu.hide();
                        menutimer = null;
                    }, 1000 );
                }
            });
        
            termmenu.mouseover(function(){
                if ( menutimer ){
                    clearTimeout(menutimer);
                    menutimer = null;
                }
            });

            addTerm(terms1div);
            addTerm(terms1div);
            addTerm(terms1div);
            addTerm(terms2div);
            addTerm(terms2div);
            addTerm(terms2div);
            addClause();
            //addTerm(clause);
            //addTerm(clause);

            $("#set_title",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("title"); });
            $("#set_desc",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("desc"); });
            $("#set_topic",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("topic"); });
            $("#set_alias",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("alias"); });
            $("#set_owner",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("owner"); });
            $("#set_size",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("size"); });
            $("#set_ctime",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("ct"); });
            $("#set_utime",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("ut"); });
            $("#set_md",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("md.",true); });
        },
        close: function( ev, ui ) {
            $(this).dialog("destroy").remove();
        }
    };

    frame.dialog( options ).parent().draggable({handle: ".ui-tabs-nav"});
}