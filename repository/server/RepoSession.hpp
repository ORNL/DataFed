#include <string>
#include <map>
#include <stdint.h>
#include <asio.hpp>
#include <asio/ssl.hpp>
#include "MsgBuf.hpp"
#include "SDMS.pb.h"

namespace SDMS {
namespace Repo {

class Session;
typedef std::shared_ptr<Session> spSession;

class ISessionMgr
{
public:

    virtual void                    sessionClosed( spSession ) = 0;
    virtual std::string             getDataPath( const std::string & a_data_id ) = 0;
};


class Session : public std::enable_shared_from_this<Session>
{
public:

    Session( asio::io_service & a_io_service, asio::ssl::context& a_context, ISessionMgr & a_sess_mgr );
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
    void procStatusRequest();
    void procDataDeleteRequest();
    void procDataGetSizeRequest();

    typedef void (Session::*msg_fun_t)();

    ISessionMgr &           m_sess_mgr;
    ssl_socket              m_socket;
    MsgBuf                  m_in_buf;
    MsgBuf                  m_out_buf;

    static std::map<uint16_t,msg_fun_t> m_msg_handlers;
};

}}
