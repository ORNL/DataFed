#include "Client.hpp"
#include <iostream>
#include <fstream>
#include <stdexcept>
#include <boost/filesystem.hpp>

#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>

#include <time.h>

#include "pbjson.hpp"

#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))


using namespace std;

namespace SDMS {

using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace Facility {

//typedef std::shared_ptr<Auth::ResolveXfrReply> spResolveXfrReply;
string loadKeyFile( const string & a_fname )
{
    string key;

    ifstream inf( a_fname );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 0, "Could not open " << a_fname << " for read" );

    inf >> key;
    inf.close();

    //cout << "loaded " << a_fname << ": [" << key << "]\n";

    return key;
}

bool
Client::verifyCredentials( const std::string & a_cred_path )
{
    try
    {
        string key = loadKeyFile( a_cred_path + "sdms-user-key.pub" );
        key = loadKeyFile( a_cred_path + "sdms-user-key.priv" );
        return true;
    }
    catch(...)
    {
        return false;
    }
}


Client::Client( const std::string & a_host, uint32_t a_port, uint32_t a_timeout, const std::string & a_service_cred_dir, const std::string & a_client_cred_dir, bool a_load_certs ) :
    m_host( a_host ),
    m_port( a_port ),
    m_cred_dir( a_client_cred_dir ),
    m_timeout( a_timeout )
{
    REG_PROTO( SDMS::Anon );
    REG_PROTO( SDMS::Auth );

    char * uid = getlogin();
    if ( uid == 0 )
        EXCEPT( 0, "Could not determine login name" );

    m_uid = uid;

    if ( m_cred_dir.size() && *m_cred_dir.rbegin() != '/' )
        m_cred_dir += "/";

    MsgComm::SecurityContext sec_ctx;
    sec_ctx.is_server = false;

    if ( a_service_cred_dir.size() && *a_service_cred_dir.rbegin() != '/' )
        sec_ctx.server_key = loadKeyFile( a_service_cred_dir + "/sdms-core-key.pub" );
    else
        sec_ctx.server_key = loadKeyFile( a_service_cred_dir + "sdms-core-key.pub" );

    if ( a_load_certs )
    {
        sec_ctx.public_key = loadKeyFile( m_cred_dir + "sdms-user-key.pub" );
        sec_ctx.private_key = loadKeyFile( m_cred_dir + "sdms-user-key.priv" );
    }
    else
    {
        //cout << "Gen temp keys\n";
        char pub_key[41];
        char priv_key[41];

        if ( zmq_curve_keypair( pub_key, priv_key ) != 0 )
            EXCEPT_PARAM( 1, "Key generation failed: " << zmq_strerror( errno ));

        sec_ctx.public_key = pub_key;
        sec_ctx.private_key = priv_key;
    }

    const char* domain = getenv("SDMS_CLIENT_DOMAIN");
    if ( domain )
        m_domain = domain;

    m_comm = new MsgComm( a_host, a_port, MsgComm::DEALER, false, &sec_ctx );
}

Client::~Client()
{
    stop();

    delete m_comm;
}

std::string Client::start()
{
    string uid;

    Anon::GetAuthStatusRequest req;
    Anon::GetAuthStatusReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    if ( reply->auth() )
        uid = reply->uid();

    delete reply;

    return uid;
}

void Client::stop()
{
}

/*
bool Client::verifyCert( bool a_preverified, asio::ssl::verify_context & a_context )
{
    // TODO What is the point of this funtions?

    char subject_name[256];

    X509* cert = X509_STORE_CTX_get_current_cert( a_context.native_handle() );
    X509_NAME_oneline( X509_get_subject_name( cert ), subject_name, 256 );

    cout << "verify " << subject_name << ", pre-ver: " << a_preverified << "\n";

    return a_preverified;
}*/


template<typename RQT,typename RPT>
void Client::send( RQT & a_request, RPT *& a_reply, uint16_t a_context )
{
    //cout << "send\n";
    MsgBuf::Message * reply = 0;
    string uid;
    MsgBuf::Frame frame;

    m_comm->send( a_request, uid, a_context );

    if ( m_comm->recv( reply, uid, frame, m_timeout ))
    {
        a_reply = dynamic_cast<RPT*>( reply );

        if ( !a_reply )
        {
            Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( reply );
            string err_msg;
            if ( nack )
                err_msg = nack->err_msg();

            delete reply;

            if ( err_msg.size() )
                EXCEPT( 0, err_msg );
            else
                EXCEPT_PARAM( 0, "Unexpected reply from server, msg_type: " << frame.getMsgType() );
        }

        return;
    }

    EXCEPT( 0, "TIMEOUT" );
}


void Client::setup()
{
    GenerateCredentialsRequest req;

    if ( m_domain.size() )
    {
        req.set_domain( m_domain );
        req.set_uid( getuid() );
    }

    GenerateCredentialsReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    try
    {
        if ( !boost::filesystem::exists( m_cred_dir ))
            boost::filesystem::create_directories(m_cred_dir);

        //cout << "Saving " << m_key_file << "\n";
        string fname = m_cred_dir + "sdms-user-key.pub";
        if ( boost::filesystem::exists( fname ))
            boost::filesystem::permissions( fname, boost::filesystem::owner_read | boost::filesystem::owner_write );

        ofstream outf( fname );
        if ( !outf.is_open() || !outf.good() )
            EXCEPT_PARAM( 0, "Could not open " << fname << " for write" );

        outf << reply->pub_key();
        outf.close();
        boost::filesystem::permissions( fname, boost::filesystem::owner_read );

        //cout << "Saving " << m_cert_file << "\n";
        fname = m_cred_dir + "sdms-user-key.priv";
        if ( boost::filesystem::exists( fname ))
            boost::filesystem::permissions( fname, boost::filesystem::owner_read | boost::filesystem::owner_write );

        outf.open( fname );
        if ( !outf.is_open() || !outf.good() )
            EXCEPT_PARAM( 0, "Could not open " << fname << " for write" );

        outf << reply->priv_key();
        outf.close();
        boost::filesystem::permissions( fname, boost::filesystem::owner_read );

        delete reply;
    }
    catch(...)
    {
        delete reply;
        throw;
    }
}

void
Client::setDefaultEndpoint( const std::string & a_def_ep )
{
    m_def_ep = a_def_ep;
}

const std::string &
Client::getDefaultEndpoint() const
{
    return m_def_ep;
}

spUserGetRecentEPReply
Client::getRecentEndpoints()
{
    Auth::UserGetRecentEPRequest req;
    Auth::UserGetRecentEPReply * reply;

    send<>( req, reply, m_ctx++ );

    return spUserGetRecentEPReply( reply );
}

bool Client::test( size_t a_iter )
{
    Anon::StatusReply     in;
    Anon::StatusReply *   out = 0;
    MsgBuf::Message *       raw;
    MsgBuf          buf;

    for ( size_t i = 0; i < a_iter; ++i )
    {
        in.set_status( SS_NORMAL );
        buf.serialize( in );
        raw = buf.unserialize();
        if ( !raw )
        {
            cerr << "unserialize failed\n";
            return false;
        }
        out = dynamic_cast<Anon::StatusReply *>(raw);
        if ( !out )
        {
            cerr << "cast failed\n";
            delete raw;
            return false;
        }
        delete raw;
    }
    return true;
}


ServiceStatus Client::status()
{
    //cout << "status\n";

    Anon::StatusRequest req;
    Anon::StatusReply * reply = 0;

    send<>( req, reply, m_ctx++ );

    ServiceStatus stat = reply->status();

    delete reply;

    return stat;
}

void
Client::authenticate( const std::string & a_uid, const string & a_password )
{
    AuthenticateRequest req;

    req.set_uid( a_uid );
    req.set_password( a_password );

    AckReply * reply;

    send<>( req, reply, m_ctx++ );

    delete reply;

    // On success, reconnect to server with same credentials
    m_comm->reset();
}

spUserDataReply
Client::userView( const string & a_uid, bool a_details )
{
    Auth::UserViewRequest req;
    Auth::UserDataReply * reply;

    req.set_uid( a_uid );
    if ( a_details )
        req.set_details( true );

    send<>( req, reply, m_ctx++ );

    return spUserDataReply( reply );
}

spUserDataReply
Client::userListCollaborators( uint32_t a_offset, uint32_t a_count )
{
    Auth::UserListCollabRequest req;
    Auth::UserDataReply * reply;

    if ( a_offset )
        req.set_offset( a_offset );
    if ( a_count )
        req.set_count( a_count );

    send<>( req, reply, m_ctx++ );

    return spUserDataReply( reply );
}

spUserDataReply
Client::userListShared(uint32_t a_offset, uint32_t a_count )
{
    (void)a_offset;
    (void)a_count;

    Auth::ACLByUserRequest req;
    Auth::UserDataReply * reply;

/*
    if ( a_details )
        req.set_details( a_details );
    if ( a_offset )
        req.set_offset( a_offset );
    if ( a_count )
        req.set_count( a_count );
*/
    send<>( req, reply, m_ctx++ );

    return spUserDataReply( reply );
}

spUserDataReply
Client::userUpdate( const std::string & a_uid, const char * a_email )
{
    Auth::UserUpdateRequest req;
    Auth::UserDataReply *   reply;

    req.set_uid( a_uid );

    if ( a_email )
        req.set_email( a_email );

    send<>( req, reply, m_ctx++ );

    return spUserDataReply( reply );
}

spProjectDataReply
Client::projectListMine()
{
    Auth::ProjectListRequest req;
    Auth::ProjectDataReply * reply;

    req.set_by_owner( true );
    req.set_by_admin( true );

    send<>( req, reply, m_ctx++ );

    return spProjectDataReply( reply );
}

spProjectDataReply
Client::projectListTeam()
{
    Auth::ProjectListRequest req;
    Auth::ProjectDataReply * reply;

    req.set_by_member( true );

    send<>( req, reply, m_ctx++ );

    return spProjectDataReply( reply );
}

spProjectDataReply
Client::projectListShared()
{
    Auth::ACLByProjRequest req;
    Auth::ProjectDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spProjectDataReply( reply );
}

spProjectDataReply
Client::projectView( const std::string & a_id )
{
    Auth::ProjectViewRequest req;
    Auth::ProjectDataReply * reply;

    req.set_id( a_id );

    send<>( req, reply, m_ctx++ );

    return spProjectDataReply( reply );
}

#if 0
string
Client::parseQuery( const string & a_query )
{
    static set<char> spec = {'(',')',' ','\t','\\','+','-','/','*','<','>','=','!','~','&','|','?'};
    static set<char> nums = {'0','1','2','3','4','5','6','7','8','9','.'};

    struct Var
    {
        Var() : start(0), len(0) {}
        void reset() { start = 0; len = 0; }

        size_t  start;
        size_t  len;
    };

    int state = 0;
    Var v;
    string result;
    string tmp;

    for ( string::const_iterator c = a_query.begin(); c != a_query.end(); ++c )
    {
        switch( state )
        {
        case 0: // Not quoted
            if ( spec.find( *c ) == spec.end() )
            {
                if ( nums.find( *c ) == nums.end() )
                {
                    if ( *c == '\'' )
                        state = 1;
                    else if ( *c == '\"' )
                        state = 2;
                    else
                    {
                        v.start = c - a_query.begin();
                        //cout << "start: " << v.start << "\n";
                        v.len = 1;
                        state = 3;
                    }
                }
            }
            break;
        case 1: // Single quote
            if ( *c == '\'' )
                state = 0;
            break;
        case 2: // Double quote
            if ( *c == '\"' )
                state = 0;
            break;
        case 3: // Identifier
            if ( spec.find( *c ) != spec.end() )
            {
                //cout << "start: " << v.start << ", len: " << v.len << "\n";
                tmp = a_query.substr( v.start, v.len );
                if ( tmp != "true" && tmp != "false" )
                {
                    result.append( "i.md." );
                }
                result.append( tmp );
                v.reset();
                state = 0;
            }
            else
                v.len++;
            break;
        }

        if ( state == 0 && *c == '?' )
            result += "LIKE";
        else if ( state != 3 )
            result += *c;
    }

    //cout << "[" << a_query << "]=>[" << result << "]\n";
    return result;
}
#endif


spListingReply
Client::recordFind( const std::string & a_query )
{
    Auth::RecordSearchRequest req;

    //req.set_query( parseQuery( a_query ));
    req.set_query( a_query );

    Auth::ListingReply * reply;

    send<>( req, reply, m_ctx++ );

    return spListingReply( reply );
}

spRecordDataReply
Client::recordView( const std::string & a_id )
{
    Auth::RecordViewRequest req;
    req.set_id( a_id );

    Auth::RecordDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spRecordDataReply( reply );
}

void 
setDepData( DependencyData *dep, const string & val )
{
    size_t p = val.find_first_of(' ');
    if ( p != string::npos )
        EXCEPT_PARAM( 0, "Invalid dependency specifiec \"" << val << "\"" );
    p = val.find_first_of(',');
    if ( p == string::npos )
        EXCEPT( 0, "Missing dependency type" );
    dep->set_id(val.substr(0,p));
    dep->set_dir( DEP_OUT );
    size_t t = stoul( val.substr(p+1) );
    if ( t >= DEP_TYPE_COUNT )
        EXCEPT( 0, "Invalid dependency type" );
    dep->set_type( (DependencyType)t );
}

spRecordDataReply
Client::recordCreate( const std::string & a_title, const char * a_desc, const char * a_alias, const char * a_keyw, const char * a_topic, const char * a_metadata, const char * a_coll_id, const char * a_repo_id, const std::vector<std::string> * a_deps )
{
    Auth::RecordCreateRequest req;

    req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );
    if ( a_alias )
        req.set_alias( a_alias );
    if ( a_keyw )
        req.set_keyw( a_keyw );
    if ( a_topic )
        req.set_topic( a_topic );
    if ( a_metadata )
        req.set_metadata( a_metadata );
    if ( a_coll_id )
        req.set_parent_id( a_coll_id );
    if ( a_repo_id )
    {
        if ( strncmp(a_repo_id,"repo/",5) != 0 )
            req.set_repo_id( string("repo/")+a_repo_id );
        else
            req.set_repo_id( a_repo_id );
    }

    if ( a_deps )
    {
        DependencyData *dep;

        for ( vector<string>::const_iterator d = a_deps->begin(); d != a_deps->end(); d++ )
        {
            dep = req.add_deps();
            setDepData( dep, *d );
        }
    }

    Auth::RecordDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spRecordDataReply( reply );
}

spRecordDataReply
Client::recordUpdate( const std::string & a_id, const char * a_title, const char * a_desc, const char * a_alias, const char * a_keyw, const char * a_topic, const char * a_metadata, bool a_md_merge, const std::vector<std::string> * a_deps_add, const std::vector<std::string> * a_deps_rem, bool a_deps_clear )
{
    Auth::RecordUpdateRequest req;

    req.set_id( a_id );
    if ( a_title )
        req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );
    if ( a_alias )
        req.set_alias( a_alias );
    if ( a_keyw )
        req.set_keyw( a_keyw );
    if ( a_topic )
        req.set_topic( a_topic );
    if ( a_metadata )
    {
        req.set_metadata( a_metadata );
        req.set_mdset( !a_md_merge );
    }

    if ( a_deps_clear )
        req.set_deps_clear( a_deps_clear );

    DependencyData *dep;
    vector<string>::const_iterator d;

    if ( a_deps_add )
    {
        for ( d = a_deps_add->begin(); d != a_deps_add->end(); d++ )
        {
            //cout << "Add dep: " << (*d) << "\n";
            dep = req.add_deps_add();
            setDepData( dep, *d );
        }
    }

    if ( a_deps_rem )
    {
        for ( d = a_deps_rem->begin(); d != a_deps_rem->end(); d++ )
        {
            //cout << "Rem dep: " << (*d) << "\n";
            dep = req.add_deps_rem();
            dep->set_id( *d );
            dep->set_type( DEP_IS_DERIVED_FROM ); // Not used (currently)
            dep->set_dir( DEP_OUT ); // Not used
        }
    }

    Auth::RecordDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spRecordDataReply( reply );
}


void
Client::recordDelete( const std::string & a_id )
{
    Auth::RecordDeleteRequest   req;
    Anon::AckReply *            rep;

    req.add_id( a_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}


spCollDataReply
Client::collList( const std::string & a_user, bool a_details, uint32_t a_offset, uint32_t a_count )
{
    Auth::CollListRequest req;

    if ( a_user.size() )
        req.set_user( a_user );
    if ( a_details )
        req.set_details( a_details );
    if ( a_offset )
        req.set_offset( a_offset );
    if ( a_count )
        req.set_count( a_count );

    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

spCollDataReply
Client::collView( const std::string & a_id )
{
    Auth::CollViewRequest req;
    req.set_id( a_id );

    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

spListingReply
Client::collRead( const std::string & a_coll_id, uint32_t a_offset, uint32_t a_count )
{
    Auth::CollReadRequest req;

    req.set_id( a_coll_id );
    if ( a_offset )
        req.set_offset( a_offset );
    if ( a_count )
        req.set_count( a_count );

    Auth::ListingReply * reply;

    send<>( req, reply, m_ctx++ );

    return spListingReply( reply );
}

spCollDataReply
Client::collCreate( const std::string & a_title, const char * a_desc, const char * a_alias, const char * a_coll_id )
{
    Auth::CollCreateRequest req;

    req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );
    if ( a_alias )
        req.set_alias( a_alias );
    if ( a_coll_id )
        req.set_parent_id( a_coll_id );

    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

spCollDataReply
Client::collUpdate( const std::string & a_id, const char * a_title, const char * a_desc, const char * a_alias )
{
    Auth::CollUpdateRequest req;

    req.set_id( a_id );
    if ( a_title )
        req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );
    if ( a_alias )
        req.set_alias( a_alias );

    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

void
Client::collDelete( const std::string & a_id )
{
    Auth::CollDeleteRequest  req;
    Anon::AckReply *         rep;

    req.add_id( a_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}

void
Client::collAddItem( const std::string & a_coll_id, const std::string & a_item_id )
{
    Auth::CollWriteRequest  req;
    Auth::ListingReply *    rep;

    req.set_id( a_coll_id );
    req.add_add( a_item_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}

void
Client::collRemoveItem( const std::string & a_coll_id, const std::string & a_item_id )
{
    Auth::CollWriteRequest  req;
    Auth::ListingReply *    rep;

    req.set_id( a_coll_id );
    req.add_rem( a_item_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}

void
Client::collMoveItem( const std::string & a_src_id, const std::string & a_dst_id, const std::string & a_item_id )
{
    Auth::CollMoveRequest   req;
    Anon::AckReply *        rep;

    req.set_src_id( a_src_id );
    req.set_dst_id( a_dst_id );
    req.add_item( a_item_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}

spCollDataReply
Client::collGetParents( const std::string & a_id, bool a_all )
{
    Auth::CollGetParentsRequest req;
    req.set_id( a_id );
    req.set_all( a_all );
    Auth::CollDataReply * reply;

    send<>( req, reply, m_ctx++ );

    return spCollDataReply( reply );
}

string
Client::applyPrefix( const string & a_path )
{
    bool prefix = false;
    string result;

    if ( a_path[0] == '/' )
    {
        prefix = true;
        result = a_path;
    }
    else if ( a_path.compare( 0, 2, "./" ) == 0 )
    {
        prefix = true;
        char buf[1024];
        result = string(getcwd( buf, 1024 )) + a_path.substr(1);
    }
    else if ( a_path.compare( 0, 2, "~/" ) == 0 )
    {
        prefix = true;
        result = string("/") + a_path;
    }

    if ( prefix )
    {
        if ( !m_def_ep.size())
        {
            EXCEPT( 0, "No default end-point set." );
        }

        return m_def_ep + result;
    }
    else
    {
        return a_path;
    }
}

spDataPathReply
Client::dataGetPath( const std::string & a_data_id )
{
    if ( !m_domain.size() )
        EXCEPT( 0, "Client must be running within an SDMS domain for direct data access." );

    Auth::DataPathRequest    req;
    Auth::DataPathReply *    rep;

    req.set_id( a_data_id );
    req.set_domain( m_domain );

    send<>( req, rep, m_ctx++ );

    return spDataPathReply( rep );
}

spXfrDataReply
Client::dataGet( const std::string & a_data_id, const std::string & a_local_path )
{
    Auth::DataGetRequest    req;
    Auth::XfrDataReply *    rep;

    req.set_id( a_data_id );
    req.set_local( applyPrefix( a_local_path ));

    send<>( req, rep, m_ctx++ );

    return spXfrDataReply( rep );
}


spXfrDataReply
Client::dataPut( const std::string & a_data_id, const std::string & a_local_path )
{
    Auth::DataPutRequest    req;
    Auth::XfrDataReply *    rep;

    req.set_id( a_data_id );
    req.set_local( applyPrefix( a_local_path ));

    send<>( req, rep, m_ctx++ );

    return spXfrDataReply( rep );
}


void
Client::dataDelete( const std::string & a_id )
{
    Auth::DataDeleteRequest req;
    Anon::AckReply *        rep;

    req.set_id( a_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}

spListingReply
Client::queryList()
{
    Auth::QueryListRequest  req;
    Auth::ListingReply *    rep;

    send<>( req, rep, m_ctx++ );

    return spListingReply( rep );
}

spQueryDataReply
Client::queryView( const std::string & a_id )
{
    Auth::QueryViewRequest      req;
    Auth::QueryDataReply *    rep;

    req.set_id( a_id );

    send<>( req, rep, m_ctx++ );

    return spQueryDataReply( rep );
}

spListingReply
Client::queryExec( const std::string & a_id )
{
    Auth::QueryExecRequest  req;
    Auth::ListingReply *    rep;

    req.set_id( a_id );

    send<>( req, rep, m_ctx++ );

    return spListingReply( rep );
}

spXfrDataReply
Client::xfrView( const std::string & a_xfr_id )
{
    Auth::XfrViewRequest    req;
    Auth::XfrDataReply *    rep;

    req.set_xfr_id( a_xfr_id );

    send<>( req, rep, m_ctx++ );

    return spXfrDataReply( rep );
}


spXfrDataReply
Client::xfrList( uint32_t * a_since, uint32_t * a_from, uint32_t * a_to, XfrStatus * a_status )
{
    Auth::XfrListRequest    req;
    Auth::XfrDataReply *    rep;

    if ( a_since )
        req.set_since( *a_since );
    if ( a_from )
        req.set_from( *a_from );
    if ( a_to )
        req.set_to( *a_to );
    if ( a_status )
        req.set_status( *a_status );

    send<>( req, rep, m_ctx++ );

    return spXfrDataReply( rep );
}


spACLDataReply
Client::aclView( const std::string & a_id )
{
    Auth::ACLViewRequest    req;
    Auth::ACLDataReply *    rep;

    req.set_id( a_id );

    send<>( req, rep, m_ctx++ );

    return spACLDataReply( rep );
}

spACLDataReply
Client::aclUpdate( const std::string & a_id, const std::string & a_rules )
{
    Auth::ACLUpdateRequest  req;
    Auth::ACLDataReply *    rep;

    req.set_id( a_id );
    req.set_rules( a_rules );

    send<>( req, rep, m_ctx++ );

    return spACLDataReply( rep );
}

// ===== GROUP METHODS =====

spGroupDataReply
Client::groupCreate( const std::string & a_group_id, const char * a_title, const char * a_desc )
{
    Auth::GroupCreateRequest  req;
    Auth::GroupDataReply *  rep;

    req.mutable_group()->set_gid( a_group_id );
    if ( a_title )
        req.mutable_group()->set_title( a_title );
    if ( a_desc )
        req.mutable_group()->set_desc( a_desc );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

spGroupDataReply
Client::groupUpdate( const std::string & a_group_id, const char * a_title, const char * a_desc )
{
    Auth::GroupUpdateRequest  req;
    Auth::GroupDataReply *  rep;

    req.set_gid( a_group_id );
    if ( a_title )
        req.set_title( a_title );
    if ( a_desc )
        req.set_desc( a_desc );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

void Client::groupDelete( const std::string & a_group_id )
{
    Auth::GroupDeleteRequest  req;
    Anon::AckReply *        rep;

    req.set_gid( a_group_id );

    send<>( req, rep, m_ctx++ );

    delete rep;
}

spGroupDataReply
Client::groupList()
{
    Auth::GroupListRequest  req;
    Auth::GroupDataReply *  rep;

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

spGroupDataReply
Client::groupView( const std::string & a_group_id )
{
    Auth::GroupViewRequest  req;
    Auth::GroupDataReply *  rep;

    req.set_gid( a_group_id );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

spGroupDataReply
Client::groupAdd( const std::string & a_group_id, const std::vector<std::string> & a_uids )
{
    Auth::GroupUpdateRequest  req;
    Auth::GroupDataReply *  rep;

    req.set_gid( a_group_id );
    for ( vector<string>::const_iterator u = a_uids.begin(); u != a_uids.end(); ++u )
        req.add_add_uid( *u );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

spGroupDataReply
Client::groupRemove( const std::string & a_group_id, const std::vector<std::string> & a_uids )
{
    Auth::GroupUpdateRequest  req;
    Auth::GroupDataReply *  rep;

    req.set_gid( a_group_id );
    for ( vector<string>::const_iterator u = a_uids.begin(); u != a_uids.end(); ++u )
        req.add_rem_uid( *u );

    send<>( req, rep, m_ctx++ );

    return spGroupDataReply( rep );
}

string
Client::messageToJSON( const ::google::protobuf::Message * a_msg )
{
    string result;

    pbjson::pb2json( a_msg, result );

    return result;
}

/*
spResolveXfrReply resolveXfr( const string & a_id, uint32_t a_perms )
{
    Auth::ResolveXfrRequest req;

    req.set_id( a_id );
    req.set_perms( a_perms );

    Auth::ResolveXfrReply * reply;

    send<>( req, reply, m_ctx++ );

    return spResolveXfrReply( reply );
}
*/

#if 0
void Client::checkPath( const string & a_dest_path, /*const string & a_file_name,*/ uint16_t a_flags )
{
    boost::filesystem::path dest_path( a_dest_path );
    boost::system::error_code ec;

    // Create or check dest path

    if ( a_flags & CREATE_PATH )
    {
        if ( !create_directories( dest_path, ec ) && ec.value() != boost::system::errc::success )
            EXCEPT_PARAM( ID_DEST_PATH_ERROR, "Could not create dest path: " << ec.message() );
    }
    else
    {
        if ( !exists( dest_path, ec ) )
            EXCEPT_PARAM( ID_DEST_PATH_ERROR, "Destination path does not exist: " << a_dest_path );
    }

    // See if raw data file already exist
    /*
    boost::filesystem::path dest_file = dest_path;
    dest_file /= boost::filesystem::path( a_file_name );

    cout << dest_file << "\n";
    if ( exists( dest_file, ec ) )
    {
        if ( a_flags & BACKUP )
        {
            boost::filesystem::path bak_file_base = dest_file;

            uint32_t num = 1;
            for ( ; num < 100; ++num )
            {
                boost::filesystem::path bak_file = bak_file_base;
                bak_file += boost::filesystem::path( "." + to_string( num ));

                if ( !exists( bak_file, ec ))
                {
                    boost::filesystem::rename( dest_file, bak_file, ec );
                    if ( ec.value() != boost::system::errc::success )
                        EXCEPT_PARAM( ID_DEST_FILE_ERROR, "Could not backup destination file: " << ec.message() );

                    break;
                }
            }

            if ( num == 100 )
                EXCEPT( ID_DEST_FILE_ERROR, "Unable to backup destination file (too many existing backup files)" );
        }
        else if ( a_flags & OVERWRITE )
        {
            boost::filesystem::file_status s = boost::filesystem::status( dest_file );
            if (( s.permissions() & 0200 ) != 0200 )
                EXCEPT( ID_DEST_FILE_ERROR, "Can not overwrite destination file (no permission)" );
        }
        else  
        {
            EXCEPT( ID_DEST_FILE_ERROR, "Destination file already exists (no Overwrite/Backup)" );
        }
    }*/

    // Test writing to dest path

    boost::filesystem::path tmp = dest_path;
    tmp /= boost::filesystem::unique_path();
    ofstream tmpf( tmp.native().c_str() );

    if ( tmpf.is_open() )
    {
        tmpf.close();
        boost::filesystem::remove( tmp );
    }
    else
    {
        EXCEPT_PARAM( ID_DEST_PATH_ERROR, "Can not write to destination path: " << a_dest_path );
    }
}
#endif

}}


