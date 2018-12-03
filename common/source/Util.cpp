#include "Util.hpp"
#include <cstdio>
#include <iostream>
#include <iomanip>
#include <memory>
#include <algorithm>
#include <set>
#include <string>
#include <string.h>
#include <array>
#include <zmq.h>
#include <rapidjson/document.h>
#include <rapidjson/error/en.h>
#include <boost/tokenizer.hpp>
#include "TraceException.hpp"
#include "SDMS.pb.h"

using namespace std;


std::string exec( const char* cmd )
{
    std::array<char, 128>   buffer;
    std::string             result;
    std::shared_ptr<FILE>   pipe( popen( cmd, "r" ), pclose );

    if ( !pipe )
        EXCEPT_PARAM( 0, "exec(" << cmd << "): popen() failed!" );

    while ( !feof( pipe.get() ) )
    {
        if ( fgets( buffer.data(), 128, pipe.get() ) != 0 )
            result += buffer.data();
    }

    return result;
}

size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata )
{
    if ( !userdata )
        return 0;

    size_t len = size*nmemb;
    ((string*)userdata)->append( ptr, len );
    return len;
}

size_t curlBodyReadCB( char *ptr, size_t size, size_t nmemb, void *userdata )
{
    if ( !userdata )
        return 0;

    curlReadBuffer * buf = (curlReadBuffer*)userdata;

    size_t len = size*nmemb;
    len = len>buf->size?buf->size:len;

    memcpy( ptr, buf->ptr, len );

    buf->size -= len;
    buf->ptr += len;

    return len;
}

void generateKeys( std::string & a_pub_key, std::string & a_priv_key )
{
    char public_key[41];
    char secret_key[41];

    if ( zmq_curve_keypair( public_key, secret_key ) != 0 )
        EXCEPT_PARAM( 1, "Key generation failed: " << zmq_strerror( errno ));

    a_pub_key = public_key;
    a_priv_key = secret_key;
}



bool isPhrase( const std::string &str )
{
    return find_if(str.begin(), str.end(), []( char c ){ return !isalnum(c); }) != str.end();
}

string parseSearchTerms( const string & a_key, const vector<string> & a_terms )
{
    vector<string> and_terms;
    vector<string> nand_terms;
    vector<string> or_terms;

    for ( vector<string>::const_iterator t = a_terms.begin(); t != a_terms.end(); ++t )
    {
        switch( (*t)[0] )
        {
        case '+':
            and_terms.push_back( (*t).substr(1) );
            break;
        case '-':
            nand_terms.push_back( (*t).substr(1) );
            break;
        default:
            or_terms.push_back( *t );
            break;
        }
    }

    string result;
    vector<string>::iterator i;

    if ( or_terms.size() > 1 )
        result += "(";

    for ( i = or_terms.begin(); i != or_terms.end(); i++ )
    {
        if ( i != or_terms.begin() )
            result += " or ";
        //if ( isPhrase( *i ) )
        result += "phrase(i['" + a_key + "'],'" + *i + "')";
        //else
        //    result += "i['" + a_key + "'] == '" + *i + "'";
    }

    if ( or_terms.size() > 1 )
        result += ")";

    for ( i = and_terms.begin(); i != and_terms.end(); i++ )
    {
        if ( result.size() )
            result += " and ";
        //if ( isPhrase( *i ) )
        result += "phrase(i['" + a_key + "'],'" + *i + "')";
        //else
        //    result += "i['" + a_key + "'] == '" + *i + "'";
    }

    for ( i = nand_terms.begin(); i != nand_terms.end(); i++ )
    {
        if ( result.size() )
            result += " and ";
        //if ( isPhrase( *i ) )
        result += "not phrase(i['" + a_key + "'],'" + *i + "')";
        //else
        //    result += "i['" + a_key + "'] != '" + *i + "'";
    }

    return "("+result+")";
}

string parseSearchPhrase( const char * key, const string & a_phrase )
{
    // tokenize phrase on ws, comma, and semicolons - properly handling quotes
    // each token is used as a search phrase and joined based on eny prefix operators:
    //  + = AND, - = NOT, | = OR
    //vector<string> tokens = smartTokenize(a_phrase," ,;");

    string separator1("");//dont let quoted arguments escape themselves
    string separator2(" ");//split on spaces
    string separator3("\"\'");//let it have quoted arguments

    boost::escaped_list_separator<char> els(separator1,separator2,separator3);
    boost::tokenizer<boost::escaped_list_separator<char>> tok(a_phrase, els);

    vector<string>  terms;

    for(boost::tokenizer<boost::escaped_list_separator<char>>::iterator t = tok.begin(); t != tok.end(); ++t )
        terms.push_back( *t );

    return parseSearchTerms( key, terms );
}

string parseSearchQuickPhrase( const string & a_phrase )
{
    /* This function parses category logic (if present) around "quick" full-
    text queries. Quick queries are typed into the "quick" text input and are
    simpler than advanced queries.Categories are title, description, and
    keywords. Categories may be specified just before query terms:

        title: fusion simulation keywords: -experiment

    If no categories are specified, all categories are searched and the
    default operator is OR for both categories and terms.

    If one or more categories are specified, the default operator for categories
    is AND but for terms it is still OR.

    Operator may be specified by prefixing category or term with:
        +   AND
        -   AND NOT

    There is no NOR operator since this would produce low-specificity queryies.

    If terms are included before a category is specified, these terms apply to all
    categories (as if they were copied as-is into each category phrase)

    Categories may only be specified once.

    Phrases are specified with single or double quotations.
    All punctuation is ignored.

    The order of categories and terms does not matter, they are grouped by operator
    in an expression such as:

        (term1 or term2 or term3) and term4 and term5 and not term6 and not term7
        OR terms                        AND terms           NAND terms
    */
    static map<string,int> cat_map =
    {
        {"t:",1},{"title:",1},
        {"d:",2},{"desc:",2},{"descr:",2},{"description:",2},
        {"k:",4},{"key:",4},{"keyw:",4},{"keyword:",4},{"keywords:",4}
    };

    string separator1("");//dont let quoted arguments escape themselves
    string separator2(" ");//split on spaces
    string separator3("\"\'");//let it have quoted arguments

    boost::escaped_list_separator<char> els(separator1,separator2,separator3);
    boost::tokenizer<boost::escaped_list_separator<char>> tok(a_phrase, els);

    string result;
    vector<string>  title,desc,keyw;

    int op = 0;
    int ops[5] = {0,0,0,0,0};
    int cat = 7;
    int count_or = 0;
    int count_other = 0;

    map<string,int>::const_iterator c;

    for(boost::tokenizer<boost::escaped_list_separator<char>>::iterator t = tok.begin(); t != tok.end(); ++t )
    {
        if ( *(*t).rbegin() == ':' )
        {
            if ( (*t)[0] == '+' )
            {
                c = cat_map.find((*t).substr(1));
                op = 2; // AND
                count_other++;
            }
            else if ( (*t)[0] == '-' )
            {
                c = cat_map.find((*t).substr(1));
                op = 3; // NAND
                count_other++;
            }
            else
            {
                c = cat_map.find(*t);
                op = 1; // OR
                count_or++;
            }

            if ( c == cat_map.end() )
                EXCEPT_PARAM(1,"Invalid query scope '" << *t << "'" );

            cat = c->second;

            if ( ops[cat] != 0 )
                EXCEPT_PARAM(1,"Invalid query - categories may only be specified once." );

            ops[cat] = op;
        }
        else
        {
            if ( cat & 1 ) title.push_back( *t );
            if ( cat & 2 ) desc.push_back( *t );
            if ( cat & 4 ) keyw.push_back( *t );
        }
    }

    // Apply default operator for unspecified categories, check for empty categories
    if ( ops[1] == 0  )
    {
        if ( title.size() )
        {
            ops[1] = 1;
            count_or++;
        }
    }
    else if ( !title.size() )
        EXCEPT(1,"Title category specified without search terms" );

    if ( ops[2] == 0 )
    {
        if ( desc.size() )
        {
            ops[2] = 1;
            count_or++;
        }
    }
    else if ( !desc.size() )
        EXCEPT(1,"Description category specified without search terms" );

    if ( ops[4] == 0 )
    {
        if ( keyw.size() )
        {
            ops[4] = 1;
            count_or++;
        }
    }
    else if ( !keyw.size() )
        EXCEPT(1,"Keywords category specified without search terms" );

    // Build OR phrase
    if ( count_or > 1 && count_other > 0 )
        result += "(";

    if ( ops[1] == 1 )
        result += parseSearchTerms( "title", title );

    if ( ops[2] == 1 )
        result += (result.size()?" or ":"") + parseSearchTerms( "desc", desc );

    if ( ops[4] == 1 )
        result += (result.size()?" or ":"") + parseSearchTerms( "keyw", keyw );

    if ( count_or > 1 && count_other > 0 )
        result += ")";

    // Build AND phrase
    if ( ops[1] == 2 )
        result += (result.size()?" and ":"") + parseSearchTerms( "title", title );

    if ( ops[2] == 2 )
        result += (result.size()?" and ":"") + parseSearchTerms( "desc", desc );

    if ( ops[4] == 2 )
        result += (result.size()?" and ":"") + parseSearchTerms( "keyw", keyw );

    // Build NAND phrase
    if ( ops[1] == 3 )
        result += (result.size()?" and not (":"not (") + parseSearchTerms( "title", title ) + ")";

    if ( ops[2] == 3 )
        result += (result.size()?" and not (":"not (") + parseSearchTerms( "desc", desc ) + ")";

    if ( ops[4] == 3 )
        result += (result.size()?" and not (":"not (") + parseSearchTerms( "keyw", keyw ) + ")";

    return result;
}


string parseSearchMetadata( const string & a_query )
{
    // Process single and double quotes (treat everything inside as part of string, until a non-escaped matching quote is found)
    // Identify supported functions as "xxx("  (allow spaces between function name and parenthesis)
    //static set<char> id_spec = {'.','_','-'};
    //static set<char> spec = {'(',')',' ','\t','\\','+','-','/','*','<','>','=','!','~','&','|','?',']','['};
    //static set<char> nums = {'0','1','2','3','4','5','6','7','8','9','.'};
    static set<string> terms = {"title","desc","alias","topic","owner","keyw","ct","ut","size"};
    static set<string> funcs = {"abs","acos","asin","atan","atan2","average","ceil","cos","degrees","exp","exp2",
        "floor","log","log2","log10","max","median","min","percentile","pi","pow","radians","round","sin","sqrt",
        "stddev_population","stddev_sample","sum","tan","variance_population","variance_sample",
        "date_now","length","lower","upper","distance","is_in_polygon"};
    static set<string> other = {"like","true","false","null","in"};


    struct Var
    {
        Var() : start(0), len(0) {}
        void reset() { start = 0; len = 0; }

        size_t  start;
        size_t  len;
    };

    enum ParseState
    {
        PS_DEFAULT = 0,
        PS_SINGLE_QUOTE,
        PS_DOUBLE_QUOTE,
        PS_TOKEN
    };

    ParseState state = PS_DEFAULT;
    Var v;
    string result,tmp;
    char last = 0, next = 0, next_nws = 0;
    string::const_iterator c2;

    for ( string::const_iterator c = a_query.begin(); c != a_query.end(); c++ )
    {
        if ( c+1 != a_query.end() )
            next = *(c+1);
        else
            next = 0;

        next_nws = 0;
        for ( c2 = c + 1; c2 != a_query.end(); c2++ )
        {
            if ( !isspace( *c2 ))
            {
                next_nws = *c2;
                break;
            }
        }

        switch( state )
        {
        case PS_DEFAULT: // Not quoted, not an identifier
            if ( *c == '\'' )
                state = PS_SINGLE_QUOTE;
            else if ( *c == '\"' )
                state = PS_DOUBLE_QUOTE;
            else if ( isalpha( *c ))
            {
                v.start = c - a_query.begin();
                //cout << "start: " << v.start << "\n";
                v.len = 1;
                state = PS_TOKEN;
            }
            break;
        case PS_SINGLE_QUOTE: // Single quote (not escaped)
            if ( *c == '\'' && *(c-1) != '\\' )
                state = PS_DEFAULT;
            break;
        case PS_DOUBLE_QUOTE: // Double quote (not escaped)
            if ( *c == '\"' && *(c-1) != '\\' )
                state = PS_DEFAULT;
            break;
        case PS_TOKEN: // Token
            //if ( spec.find( *c ) != spec.end() )
            if ( !isalnum( *c ) && *c != '.' && *c != '_' )
            {
                //cout << "start: " << v.start << ", len: " << v.len << "\n";
                tmp = a_query.substr( v.start, v.len );
                //cout << "token[" << tmp << "]" << endl;

                // Determine if identifier needs to be prefixed with "i." by testing agains allowed identifiers
                if ( tmp == "desc" )
                    result.append( "i['desc']" );
                else if ( other.find( tmp ) != other.end() || (funcs.find( tmp ) != funcs.end() && ( *c == '(' || ( isspace( *c ) && next_nws == '(' ))))
                    result.append( tmp );
                else if ( terms.find( tmp ) != terms.end() )
                {
                    result.append( "i." );
                    result.append( tmp );
                }
                else
                {
                    if ( tmp.compare( 0, 3, "md." ) == 0 )
                        result.append( "i." );
                    else
                        result.append( "i.md." );
                    result.append( tmp );
                }

                v.reset();

                state = PS_DEFAULT;
            }
            else
            {
                v.len++;

            }
            break;
        }

        // Map operators to AQL: ? to LIKE, ~ to =~, = to ==

        if ( state == PS_DEFAULT )
        {
            if ( *c == '?' )
                result += " like ";
            else if ( *c == '~' )
                if ( last != '=' )
                    result += "=~";
                else
                    result += '~';
            else if ( *c == '=' )
                if ( last != '=' && last != '<' && last != '>' && last != '!' && next != '~' && next != '=' )
                    result += "==";
                else
                    result += '=';
            else
                result += *c;
        }
        else if ( state != PS_TOKEN )
            result += *c;

        last = *c;
    }

    //cout << "[" << a_query << "]=>[" << result << "]\n";
    return result;
}


string parseQuery( const string & a_query, bool & use_client, bool & use_shared_users, bool & use_shared_projects )
{
    use_client = false;

    rapidjson::Document query;

    query.Parse( a_query.c_str() );

    if ( query.HasParseError() )
    {
        rapidjson::ParseErrorCode ec = query.GetParseError();
        EXCEPT_PARAM( 1, "Invalid query: " << rapidjson::GetParseError_En( ec ));
    }

    string phrase;
    rapidjson::Value::MemberIterator imem = query.FindMember("quick");
    if ( imem != query.MemberEnd() )
    {
        phrase = parseSearchQuickPhrase( imem->value.GetString() );
    }
    else
    {
        rapidjson::Value::MemberIterator imem = query.FindMember("title");
        if ( imem != query.MemberEnd() )
            phrase = parseSearchPhrase( "title", imem->value.GetString() );

        imem = query.FindMember("desc");
        if ( imem != query.MemberEnd() )
        {
            if ( phrase.size() )
                phrase += " or ";
            phrase += parseSearchPhrase( "desc", imem->value.GetString() );
        }

        imem = query.FindMember("keyw");
        if ( imem != query.MemberEnd() )
        {
            if ( phrase.size() )
                phrase += " or ";
            phrase += parseSearchPhrase( "keyw", imem->value.GetString() );
        }
    }

    string meta;
    imem = query.FindMember("meta");
    if ( imem != query.MemberEnd() )
    {
        meta = parseSearchMetadata( imem->value.GetString() );
    }

    string result;

    if ( phrase.size() )
        result += string("for i in intersection((for i in textview search analyzer(") + phrase + ",'text_en') return i),(";

    imem = query.FindMember("scopes");
    if ( imem == query.MemberEnd() )
        EXCEPT(1,"No query scope provided");

    int scope;
    rapidjson::Value::MemberIterator imem2;

    if ( imem->value.Size() > 1 )
        result += "for i in union((";

    bool inc_ret = false;
    if ( imem->value.Size() > 1 || phrase.size() )
        inc_ret = true;

    for ( rapidjson::SizeType i = 0; i < imem->value.Size(); i++ )
    {
        if ( i > 0 )
            result += "),(";

        rapidjson::Value & val = imem->value[i];
        imem2 = val.FindMember("scope");
        if ( imem2 == val.MemberEnd() )
            EXCEPT(1,"Missing scope value");
        scope = imem2->value.GetUint();

        switch( scope )
        {
        case SDMS::SS_USER:
            result += "for i in 1..1 inbound @client owner filter is_same_collection('d',i)";
            use_client = true;
            break;
        case SDMS::SS_PROJECT:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for project");
            result += string("for i in 1..1 inbound '") + imem2->value.GetString() + "' owner filter is_same_collection('d',i)";
            break;
        case SDMS::SS_OWNED_PROJECTS:
            result += "for i,e,p in 2..2 inbound @client owner filter IS_SAME_COLLECTION('p',p.vertices[1]) and IS_SAME_COLLECTION('d',i)";
            use_client = true;
            break;
        case SDMS::SS_MANAGED_PROJECTS:
            result += "for i,e,p in 2..2 inbound @client admin, owner filter IS_SAME_COLLECTION('p',p.vertices[1]) and IS_SAME_COLLECTION('d',i)";
            use_client = true;
            break;
        case SDMS::SS_MEMBER_PROJECTS:
            result += "for i,e,p in 3..3 inbound @client member, any owner filter p.vertices[1].gid == 'members' and IS_SAME_COLLECTION('p',p.vertices[2]) and IS_SAME_COLLECTION('d',i)";
            use_client = true;
            break;
        case SDMS::SS_COLLECTION:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for collection");
            result += string("for i in 1..10 outbound '") + imem2->value.GetString() + "' item filter is_same_collection('d',i)";
            break;
        case SDMS::SS_TOPIC:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for topic");
            result += string("for i in 1..10 inbound '") + imem2->value.GetString() + "' top filter is_same_collection('d',i)";
            break;
        case SDMS::SS_SHARED_BY_USER:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for shared user");
            //result += "for i in 1..1 inbound " + imem2->value.GetString() + " owner filter IS_SAME_COLLECTION('d',i) return i";
            use_client = true;
            result += string("for i in union_distinct("
                "(for v in 1..2 inbound @client member, acl filter is_same_collection('d',v) and v.owner == '") + imem2->value.GetString() + "' return v),"
                "(for v,e in 3..11 inbound @client member, acl, outbound item filter is_same_collection('member',p.edges[0]) and v.owner == '" + imem2->value.GetString() + "' return v),"
                "(for v in 2..12 inbound @client acl, outbound item filter is_same_collection('d',v) and v.owner == '" + imem2->value.GetString() + "' return v)"
                ")";
            break;
        case SDMS::SS_SHARED_BY_ANY_USER:
            //result += "for u in @shared_users for i in 1..1 inbound u owner filter IS_SAME_COLLECTION('d',i) return i";
            use_client = true;
            use_shared_users = true;
            result += "for i in union_distinct("
                "(for v in 1..2 inbound @client member, acl filter is_same_collection('d',v) and v.owner in @users return v),"
                "(for v,e in 3..11 inbound @client member, acl, outbound item filter is_same_collection('member',p.edges[0]) and v.owner in @users return v),"
                "(for v in 2..12 inbound @client acl, outbound item filter is_same_collection('d',v) and v.owner in @users return v)"
                ")";
            break;
        case SDMS::SS_SHARED_BY_PROJECT:
            imem2 = val.FindMember("id");
            if ( imem2 == val.MemberEnd() )
                EXCEPT(1,"Missing scope 'id' for shared project");
            use_client = true;
            result += string("for i in union_distinct("
                "(for v in 1..2 inbound @client member, acl filter is_same_collection('d',v) and v.owner == '") + imem2->value.GetString() + "' return v),"
                "(for v,e in 3..11 inbound @client member, acl, outbound item filter is_same_collection('member',p.edges[0]) and v.owner == '" + imem2->value.GetString() + "' return v),"
                "(for v in 2..12 inbound @client acl, outbound item filter is_same_collection('d',v) and v.owner == '" + imem2->value.GetString() + "' return v)"
                ")";
            break;
        case SDMS::SS_SHARED_BY_ANY_PROJECT:
            use_shared_projects = true;
            result += "for i in union_distinct("
                "(for v in 1..2 inbound @client member, acl filter is_same_collection('d',v) and v.owner in @projs return v),"
                "(for v,e in 3..11 inbound @client member, acl, outbound item filter is_same_collection('member',p.edges[0]) and v.owner in @projs return v),"
                "(for v in 2..12 inbound @client acl, outbound item filter is_same_collection('d',v) and v.owner in @projs return v)"
                ")";
            break;
        case SDMS::SS_PUBLIC:
            result += "for i in d filter i.public == true and i.owner != @client";
            use_client = true;
            break;
        case SDMS::SS_VIEW:
            break;
        }

        if ( inc_ret )
            result += " return i";
    }

    if ( imem->value.Size() > 1 )
    {
        result += "))";
        if ( phrase.size() )
            result += " return i";
    }

    if ( phrase.size() )
        result += "))";

    if ( meta.size() )
        result += " filter " + meta;

    result += " return {id:i._id,title:i.title,alias:i.alias,locked:i.locked}";


    return result;
}


void hexDump( const char * a_buffer, const char *a_buffer_end, ostream & a_out )
{
    const unsigned char * p = (unsigned char *) a_buffer;
    const unsigned char * e = (unsigned char *) a_buffer_end;
    bool done = false;

    int l = 0, i = 0;
    while ( !done )
    {
        a_out << setw(4) << dec << l << ": ";

        for ( i = 0; i < 16; ++i )
        {
            if ( i == 8 )
                a_out << "  ";

            if ( p + i != e )
            {
                a_out << hex << setw(2) << setfill('0') << ((unsigned short)(*(p+i))) << " ";
            }
            else
            {
                done = true;

                for ( ; i < 16; ++i )
                    a_out << "   ";

                break;
            }
        }

        a_out << "  ";

        for ( i = 0; i < 16; ++i )
        {
            if ( p + i != e )
            {
                if ( isprint( *(p + i )))
                    a_out << *(p+i);
                else
                    a_out << ".";
            }
            else
                break;
        }

        a_out << "\n";

        p += 16;
        l += 16;
    }
}

string escapeCSV( const string & a_value )
{
    string::size_type p1 = 0,p2;
    string result;
    result.reserve( a_value.size() + 20 );

    while ( 1 )
    {
        p2 = a_value.find( '"', p1 );
        if ( p2 == string::npos )
        {
            result.append( a_value, p1, p2 );
            break;
        }

        result.append( a_value, p1, p2 - p1 + 1 );
        result.append( "\"" );
        p1 = p2 + 1;
    }

    return result;
}

string escapeJSON( const std::string & a_value )
{
    static const char* values[] = {
        "\\u0000","\\u0001","\\u0002","\\u0003","\\u0004","\\u0005","\\u0006","\\u0007",
        "\\u0008","\\u0009","\\u000A","\\u000B","\\u000C","\\u000D","\\u000E","\\u000F",
        "\\u0010","\\u0011","\\u0012","\\u0013","\\u0014","\\u0015","\\u0016","\\u0017",
        "\\u0018","\\u0019","\\u001A","\\u001B","\\u001C","\\u001D","\\u001E","\\u001F"
    };

    string result;
    result.reserve( a_value.size()*2 );

    for ( auto c = a_value.cbegin(); c != a_value.cend(); c++ )
    {
        if ( *c == '"' )
            result.append( "\\\"" );
        else if ( *c == '\\' )
            result.append( "\\\\" );
        else if ( '\x00' <= *c && *c <= '\x1f')
            result.append( values[(size_t)*c] );
        else
            result.append( 1, *c );
    }

    return result;
}