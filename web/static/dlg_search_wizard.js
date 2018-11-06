function dlgSearchWizard( a_cb ) {
    if ( !a_cb ){
        console.log("search wiz invalid cb");
        return;
    }

    var frame = $(document.createElement('div'));
    frame.html("<div id='terms1'>Match <b>all</b> of these terms:<button style='float:right' id='add_term1' class='btn small'>Add</button><hr></div>\
        <div id='terms2' style='padding:1em 0 0 0'>Match <b>any</b> of these terms:<button style='float:right' id='add_term2' class='btn small'>Add</button><hr>\
        </div>");

    var valid_terms = ["title","desc","alias","owner","topic","size","ctime","utime"];
    var cur_term = null;
    $(".btn",frame).button();

    $("#add_term1",frame).on("click",function(){
        //console.log("add term 1");
        addTerm("#terms1");
    });

    $("#add_term2",frame).on("click",function(){
        //console.log("add term 2");
        addTerm("#terms2");
    });

    frame.on("click", ".remove-btn", function( ev ){
        //console.log("remove btn", $(this), ev);
        $(this).parent().remove();
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

    function setTerm( value, focus ){
        //console.log("setTerm",cur_term);
        var input = $( ".term-input", cur_term );
        input.val( value );
        if ( focus )
            input.focus();
    }

    function addTerm( target ){
        var child = $( target, frame ).append("<div class='req-term' style='padding:.25em 0'><input title='Search term' class='term-input' type='text'></input><button class='btn small drop pick-term-btn'><span class='ui-icon ui-icon-triangle-1-s'></span></button>\
        <select><option value='=='>=</option><option value='!='>!=</option><option value='&lt;'>&lt</option><option value='&lt;='>&lt;=</option><option value='&gt;='>&gt;=</option><option value='&gt;'>&gt;</option><option title='Regular expression' value='=~'>Regex</option><option title='Pattern match' value='like'>Like</option><option title='Defined' value='def'>Def</option><option title='Not defined' value='undef'>!Def</option></select>\
        <input title='Value to match' type='text'></input>\
        <button class='btn small remove-btn '><span class='ui-icon ui-icon-close' style='color:red'></span></button>\
        </div>");
        $( ".btn", child ).button();
        $( "select", child ).selectmenu({width:false,classes:{"ui-selectmenu-button":"search-wiz-select-button"}});
        inputTheme($( "input", child ));
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
                        if ( term == "ctime" || term == "utime" ){
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
        title: "Search Wizard (UNDER DEVELOPMENT)",
        modal: true,
        width: "auto",
        height: 500,
        resizable: false,
        closeOnEscape: true,
        buttons: [{
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
                        };
                    }

                    if ( terms2.length ){
                        for ( i = 0; i < terms2.length; i++ ){
                            p = parseTerms( $( terms2[i] ));
                            if ( p ){
                                if ( qry2 ) qry2 += " || ";
                                qry2 += p;
                            }
                        };
                    }

                    if ( qry1 && qry2 )
                        qry = "(" + qry1 + ") && (" + qry2 + ")";
                    else
                        qry = qry1?qry1:qry2;

                    //console.log( "query:", qry );

                    a_cb( qry );
                    $(this).dialog('destroy').remove();
                }catch(e){
                    dlgAlert("Input Error", e );
                }
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
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

            addTerm("#terms1");
            addTerm("#terms2");
        
            $("#set_title",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("title"); });
            $("#set_desc",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("desc"); });
            $("#set_topic",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("topic"); });
            $("#set_alias",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("alias"); });
            $("#set_owner",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("owner"); });
            $("#set_size",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("size"); });
            $("#set_ctime",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("ctime"); });
            $("#set_utime",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("utime"); });
            $("#set_md",dlg_frame).on('click', function(){ $("#termmenu").hide(); setTerm("md.",true); });
        }
    };

    frame.dialog( options );
}