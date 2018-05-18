#ifndef EXEC_HPP

#include <string>

std::string exec( const char* cmd );

size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata );

#endif
