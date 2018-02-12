#ifndef CENTRALDBCLIENT_HPP
#define CENTRALDBCLIENT_HPP

#include "SDMS.pb.h"

namespace SDMS {

class CentralDatabaseClientImpl;

class CentralDatabaseClient
{
public:
    CentralDatabaseClient();
    ~CentralDatabaseClient();

    void setClient( const std::string & a_client );

    void userView( const UserViewRequest & a_request, UserDataReply & a_reply );
    void userList( const UserListRequest & a_request, UserDataReply & a_reply );
    void recordView( const RecordViewRequest & a_request, RecordDataReply & a_reply );
    void collList( const CollListRequest & a_request, CollDataReply & a_reply );

private:
    CentralDatabaseClientImpl* m_impl;
};

}

#endif
