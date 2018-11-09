#include "Util.hpp"
#include <cstdio>
#include <iostream>
#include <iomanip>
#include <memory>
#include <set>
#include <string>
#include <string.h>
#include <array>
#include <zmq.h>
#include "TraceException.hpp"

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

string parseQuery( const string & a_query )
{
    // Process single and double quotes (treat everything inside as part of string, until a non-escaped matching quote is found)
    // Identify supported functions as "xxx("  (allow spaces between function name and parenthesis)
    static set<char> ws = {' ','\t','\n','\r'};
    static set<char> id_spec = {'.','_','-'};
    static set<char> spec = {'(',')',' ','\t','\\','+','-','/','*','<','>','=','!','~','&','|','?',']','['};
    static set<char> nums = {'0','1','2','3','4','5','6','7','8','9','.'};
    static set<string> terms = {"title","desc","alias","topic","owner","keyw","ct","ut","size"};
    static set<string> allowed = {"abs","acos","asin","atan","atan2","average","ceil","cos","degrees","exp","exp2",
        "floor","log","log2","log10","max","median","min","percentile","pi","pow","radians","round","sin","sqrt",
        "stddev_population","stddev_sample","sum","tan","variance_population","variance_sample",
        "date_now","length","lower","upper","distance","is_in_polygon","true","false","null","in"};

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
    string result,last_token,tmp;
    bool array_deref = false;

    for ( string::const_iterator c = a_query.begin(); c != a_query.end(); ++c )
    {
        switch( state )
        {
        case PS_DEFAULT: // Not quoted, not an identifier

            /* NOTES: whitespace outside of quotes can be anywhere
                even between object deref: x  .  y  [ "foo"  ] [  z[ 2 ]] is OK
            */
            if ( ws.find(*c) == ws.end() )
            {
                if ( array_deref )
                {
                }

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
                {
                    result.append( "i['" );
                    result.append( tmp );
                    result.append( "']" );
                }
                else if ( terms.find( tmp ) != terms.end() || tmp.compare( 0, 3, "md." ) == 0 || ( tmp == "md" && *c == '[' ))
                {
                    result.append( "i." );
                    result.append( tmp );

                    if ( *c == '[' )
                        array_deref = true;
                    else
                        last_token = tmp;
                }
                else if ( allowed.find( tmp ) != allowed.end())
                {
                    result.append( tmp );
                }
                else
                    EXCEPT_PARAM(1,"Illegal term in query: " << tmp );

                v.reset();

                state = PS_DEFAULT;
            }
            else
                v.len++;
            break;
        }

        if ( state == PS_DEFAULT && *c == '?' )
            result += " LIKE ";
        else if ( state != PS_TOKEN )
            result += *c;
    }

    // Handle identifiers at end of line
    if ( state == PS_TOKEN )
    {
        tmp = a_query.substr( v.start, v.len );

        if ( tmp == "desc" )
        {
            result.append( "i['desc']" );
        }
        else if ( terms.find( tmp ) != terms.end() || tmp.compare( 0, 3, "md." ) == 0 )
        {
            result.append( "i." );
            result.append( tmp );
        }
        else if ( allowed.find( tmp ) != allowed.end())
        {
            result.append( tmp );
        }
        else
            EXCEPT_PARAM(1,"Illegal term in query: " << tmp );
    }

    //cout << "[" << a_query << "]=>[" << result << "]\n";
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