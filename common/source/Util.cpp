#include "Util.hpp"
#include <cstdio>
#include <iostream>
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
    //strncat( userdata, ptr, len );
    //cout << "curl rcv " << len << " bytes from " << (void*)ptr << " into " << userdata << endl;
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
    static set<char> spec = {'(',')',' ','\t','\\','+','-','/','*','<','>','=','!','~','&','|','?'};
    static set<char> nums = {'0','1','2','3','4','5','6','7','8','9','.'};

    struct Var
    {
        Var() : start(0), len(0) {}
        void reset() { start = 0; len = 0; }

        size_t  start;
        size_t  len;
    };

    int state = 0;
    Var v;
    string result;
    string tmp;

    for ( string::const_iterator c = a_query.begin(); c != a_query.end(); ++c )
    {
        switch( state )
        {
        case 0: // Not quoted
            if ( spec.find( *c ) == spec.end() )
            {
                if ( nums.find( *c ) == nums.end() )
                {
                    if ( *c == '\'' )
                        state = 1;
                    else if ( *c == '\"' )
                        state = 2;
                    else
                    {
                        v.start = c - a_query.begin();
                        //cout << "start: " << v.start << "\n";
                        v.len = 1;
                        state = 3;
                    }
                }
            }
            break;
        case 1: // Single quote
            if ( *c == '\'' )
                state = 0;
            break;
        case 2: // Double quote
            if ( *c == '\"' )
                state = 0;
            break;
        case 3: // Identifier
            if ( spec.find( *c ) != spec.end() )
            {
                //cout << "start: " << v.start << ", len: " << v.len << "\n";
                tmp = a_query.substr( v.start, v.len );
                cout << "token[" << tmp << "]" << endl;
                if ( tmp == "id" )
                {
                    result.append( "i._id" );
                }
                else if ( tmp == "desc" )
                {
                    result.append( "i['" );
                    result.append( tmp );
                    result.append( "']" );
                }
                else if ( tmp != "true" && tmp != "false" && tmp != "null" && tmp != "in" && tmp != "not" && tmp[0] != '[' )
                {
                    result.append( "i." );
                    result.append( tmp );
                }
                else
                    result.append( tmp );

                v.reset();
                state = 0;
            }
            else
                v.len++;
            break;
        }

        if ( state == 0 && *c == '?' )
            result += "LIKE";
        else if ( state != 3 )
            result += *c;
    }

    // Handle identifiers at end of line
    if ( state == 3 )
    {
        tmp = a_query.substr( v.start, v.len );
        if ( tmp != "true" && tmp != "false" && tmp != "null" && tmp[0] != '[' )
            result.append( "i." );

        result.append( tmp );
    }

    cout << "[" << a_query << "]=>[" << result << "]\n";
    return result;
}
