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

    //void checkPerms( const Auth::CheckPermsRequest & a_request, Auth::CheckPermsReply & a_reply );
    //uint16_t checkPerms( const string & a_id, uint16_t a_perms );
    void userView( const Auth::UserViewRequest & a_request, Auth::UserDataReply & a_reply );
    void userList( const Auth::UserListRequest & a_request, Auth::UserDataReply & a_reply );
    void recordView( const Auth::RecordViewRequest & a_request, Auth::RecordDataReply & a_reply );
    void collList( const Auth::CollListRequest & a_request, Auth::CollDataReply & a_reply );

    void xfrView( const Auth::XfrViewRequest & a_request, Auth::XfrDataReply & a_reply );
    void xfrInit( const std::string & a_id, const std::string & a_data_path, XfrMode a_mode, Auth::XfrDataReply & a_reply );
    void xfrUpdate( const std::string & a_xfr_id, XfrStatus a_status, const std::string & a_task_id = "" );

private:
    CentralDatabaseClientImpl* m_impl;
};

}

#endif
