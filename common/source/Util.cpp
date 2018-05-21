#include "Util.hpp"
#include <cstdio>
#include <iostream>
#include <memory>
#include <string>
#include <string.h>
#include <array>
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
