#ifndef EXEC_HPP

#include <cstdio>
#include <iostream>
#include <memory>
#include <string>
#include <array>
#include "TraceException.hpp"

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


#endif
