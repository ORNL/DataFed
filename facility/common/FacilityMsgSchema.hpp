#ifndef FACILITY_MGS_SCHEMA_HPP
#define FACILITY_MGS_SCHEMA_HPP

#include <Connection.hpp>

namespace SDMS {
namespace Facility {

enum MessageType : uint16_t
{
    FMT_ACK = 0,
    FMT_NACK,
    FMT_PING,
    FMT_LOGIN,
    FMT_LOGOUT,
    FMT_USER_LIST,
    FMT_USER_VIEW,
    FMT_DATA_CREATE,
    FMT_DATA_UPDATE,
    FMT_DATA_READ,
    FMT_DATA_WRITE,
    FMT_DATA_DELETE,
    _FMT_END
};

struct MsgPing : public Connection::MsgHeader
{
    MsgPing() : MsgHeader( FMT_PING, sizeof( MsgPing )), context(0) {}
    MsgPing( uint32_t a_ctx ) : MsgHeader( FMT_PING, sizeof( MsgPing ) ), context( a_ctx ) {}

    uint32_t        context;
};



}}

#endif
