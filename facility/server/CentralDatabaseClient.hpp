#ifndef CENTRALDBCLIENT_HPP
#define CENTRALDBCLIENT_HPP

#include "SDMS.pb.h"
#include "SDMS_Auth.pb.h"

namespace SDMS {

class CentralDatabaseClientImpl;

class CentralDatabaseClient
{
public:
    CentralDatabaseClient();
    ~CentralDatabaseClient();

    void setClient( const std::string & a_client );

    void checkPerms( const Auth::CheckPermsRequest & a_request, Auth::CheckPermsReply & a_reply );
    void userView( const Auth::UserViewRequest & a_request, Auth::UserDataReply & a_reply );
    void userList( const Auth::UserListRequest & a_request, Auth::UserDataReply & a_reply );
    void recordView( const Auth::RecordViewRequest & a_request, Auth::RecordDataReply & a_reply );
    void collList( const Auth::CollListRequest & a_request, Auth::CollDataReply & a_reply );
    void resolveXfr( const Auth::ResolveXfrRequest & a_request, Auth::ResolveXfrReply & a_reply );

    void userByUname( const std::string & a_uname, Auth::UserDataReply & a_reply );

private:
    CentralDatabaseClientImpl* m_impl;
};

}

#endif
