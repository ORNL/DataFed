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

}