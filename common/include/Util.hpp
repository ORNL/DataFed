#ifndef EXEC_HPP

#include <string>

std::string exec( const char* cmd );

struct curlReadBuffer
{
    char * ptr;
    size_t size;
};

size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata );
size_t curlBodyReadCB( char *ptr, size_t size, size_t nitems, void *userdata );

#endif
