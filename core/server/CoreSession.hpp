#ifndef CORESESSION_HPP
#define CORESESSION_HPP

#include <string>
#include <map>
#include <stdint.h>
#include <asio.hpp>
#include <asio/ssl.hpp>
#include "MsgBuf.hpp"
#include "CoreDatabaseClient.hpp"
#include "SDMS.pb.h"

namespace SDMS {
namespace Core {

class Session;
typedef std::shared_ptr<Session> spSession;

class ISessionMgr
{
public:

    virtual void                    sessionClosed( spSession ) = 0;
    virtual const std::string &     getCertFile() = 0;
    virtual const std::string &     getKeyFile() = 0;
    virtual void                    generateKeys( const std::string & a_uid, std::string & a_key_data ) = 0;
    virtual void                    getPublicKey( const std::string & a_uid, std::string & a_key_data ) = 0;
    virtual const std::string &     getCountry() = 0;
    virtual const std::string &     getOrg() = 0;
    virtual const std::string &     getUnit() = 0;
    virtual void                    handleNewXfr( const XfrData & a_xfr, const std::string & a_uid ) = 0;

    // TODO Methods that belong in CentralServer
    virtual void                    dataDelete( const std::string & a_data_id ) = 0;
};


class Session : public std::enable_shared_from_this<Session>
{
public:

    Session( asio::io_service & a_io_service, asio::ssl::context& a_context, ISessionMgr & a_sess_mgr, const std::string & a_db_url, const std::string & a_db_user, const std::string & a_db_pass );
    virtual ~Session();

    void        start();
    void        close();
    std::string remoteAddress();
    asio::basic_socket<asio::ip::tcp, asio::stream_socket_service<asio::ip::tcp> > &
                getSocket();
    double      lastAccessTime();

private:

    typedef asio::ssl::stream<asio::ip::tcp::socket> ssl_socket;

    static void setupMsgHandlers();

    void handleCommError( const std::string & a_msg, std::error_code a_ec );
    bool verifyCert( bool a_preverified, asio::ssl::verify_context & a_context );
    void readMsgHeader();
    void readMsgBody();
    void messageHandler();
    void writeMsgHeader();
    void writeMsgBody();
    void procMsgServerInfo();
    void procMsgAuthenticate();
    void procMsgStatus();
    void procMsgSetLocalIdentity();
    void procMsgGenerateCredentials();
    void procMsgGenerateKeys();
    void procMsgGetPublicKey();
    void procMsgDataGet();
    void procMsgDataPut();
    void procMsgDataDelete();
    void procMsgRecordDelete();
    template<typename RQ, typename RP, void (DatabaseClient::*func)( const RQ &, RP &)>
    void dbPassThrough();

    typedef void (Session::*msg_fun_t)();

    ISessionMgr &           m_sess_mgr;
    ssl_socket              m_socket;
    bool                    m_anon;
    std::string             m_uid;
    MsgBuf                  m_in_buf;
    MsgBuf                  m_out_buf;
    struct timespec         m_last_access = {0,0};
    DatabaseClient          m_db_client;

    static std::map<uint16_t,msg_fun_t> m_msg_handlers;
};

}}

#endif
