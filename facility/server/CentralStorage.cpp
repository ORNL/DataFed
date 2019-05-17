#include <iostream>
#include <boost/filesystem.hpp>
#include "CentralStorage.hpp"

using namespace std;

namespace SDMS {

CentralStorage::CentralStorage()
{
}

CentralStorage::~CentralStorage()
{
}

void
CentralStorage::dataDelete( const std::string & a_filename )
{
    boost::system::error_code ec;
    boost::filesystem::path data_path( a_filename );

    if ( boost::filesystem::remove( data_path, ec ))
    {
        if ( ec )
        {
            cerr << "Delete " << a_filename << " error\n";
        }
    }
}

bool
CentralStorage::dataGetSize( const std::string & a_filename, size_t & a_size )
{
    boost::system::error_code ec;
    boost::filesystem::path data_path( a_filename );

    if ( boost::filesystem::exists( data_path, ec ))
    {
        a_size = boost::filesystem::file_size( data_path );

        return true;
    }

    cout << "dataGetSize: file " << a_filename << " does not exist\n";
    return false;
 }

}