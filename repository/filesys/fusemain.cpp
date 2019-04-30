#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>
#include <limits.h>
#include <fcntl.h>
#include <dirent.h>
#include <fstream>
#include <string>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <boost/program_options.hpp>

#define FUSE_USE_VERSION 29
#include <fuse.h>

#define DEF_DYNALOG
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "MsgBuf.hpp"
#include "MsgComm.hpp"
#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"

using namespace std;

#define VERSION "0.1.0"

template <typename T>
class Queue
{
public:
    T pop()
    {
        unique_lock<mutex> mlock(m_mutex);
        while (m_queue.empty())
            m_cv.wait(mlock);

        auto item = m_queue.front();
        m_queue.pop();
        return item;
    }

    void pop( T& item )
    {
        unique_lock<mutex> mlock(m_mutex);
        while (m_queue.empty())
            m_cv.wait(mlock);

        item = m_queue.front();
        m_queue.pop();
    }

    void push( const T& item )
    {
        unique_lock<mutex> mlock(m_mutex);
        m_queue.push(item);
        mlock.unlock();
        m_cv.notify_one();
    }

    void push( T&& item)
    {
        unique_lock<mutex> mlock(m_mutex);
        m_queue.push(std::move(item));
        mlock.unlock();
        m_cv.notify_one();
    }

private:
    queue<T>            m_queue;
    mutex               m_mutex;
    condition_variable  m_cv;
};

class CoreProxy;

Queue<CoreProxy*>           g_ready_queue;
MsgComm::SecurityContext    g_sec_ctx;
string                      g_core_addr;
string                      g_root_path;
string                      g_domain;
string                      g_repo_id;

class CoreProxy
{
public:
    CoreProxy( const MsgComm::SecurityContext & a_sec_ctx, const string & a_hostname, const string & a_repo_id, const string & a_core_addr ):
        m_sec_ctx(a_sec_ctx), m_core_addr(a_core_addr), m_repo_id(a_repo_id), m_run(true), m_path(0), m_ready( false )
    {
        m_prefix = string("fus://") + a_hostname;
        m_thread = new thread( &CoreProxy::threadFunc, this );
    };

    ~CoreProxy()
    {
        unique_lock<mutex> lock(m_mutex);
        m_run = false;
        m_cv.notify_all();
        m_thread->join();
        delete m_thread;
    };

    bool authorize( const char *a_path, string a_uid )
    {
        DL_INFO( "SDMS-FS (" << this << ") authorize " << a_path << ", " << a_uid  );

        unique_lock<mutex> lock(m_mutex);

        m_auth = false;
        m_uid = a_uid;
        m_path = a_path;
        m_ready = true;

        m_cv.notify_one();

        while ( m_ready && m_run )
        {
            //DL_INFO( "SDMS-FS auth going to sleep " << m_ready << " " << m_run );
            m_cv.wait( lock );
            //DL_INFO( "SDMS-FS auth awake " << m_ready << " " << m_run );
        }

        DL_INFO( "SDMS-FS authorize done" );

        return m_auth;
    };

private:
    void threadFunc()
    {
        MsgComm comm( m_core_addr, MsgComm::DEALER, false, &m_sec_ctx );

        SDMS::Auth::RepoAuthzRequest    request;
        MsgBuf::Message *               reply;
        //Anon::NackReply *               nack;
        MsgBuf::Frame                   frame;

        request.set_repo( m_repo_id ) ;
        request.set_action( "read" );

        unique_lock<mutex> lock( m_mutex, defer_lock );

        while( m_run )
        {
            DL_INFO( "SDMS-FS (" << this << ") thread top of loop" );

            lock.lock();
            while ( !m_ready && m_run )
            {
                //DL_INFO( "SDMS-FS thread going to sleep " << m_ready << " " << m_run );
                m_cv.wait( lock );
                //DL_INFO( "SDMS-FS thread awake " << m_ready << " " << m_run );
            }

            if ( !m_run )
                break;

            DL_INFO( "SDMS-FS do auth for " << m_path << ", " << m_uid );

            request.set_file( m_prefix + m_path );
            request.set_client( m_uid );

            comm.send( request );

            if ( !comm.recv( reply, frame, 10000 ))
            {
                DL_ERROR( "SDMS-FS Core Server Timeout" );
            }
            else
            {
                DL_INFO( "SDMS-FS Got Core Server Reply, pid: " << frame.proto_id << ", msg_id: " << frame.msg_id << ", sz: " << frame.size );

                if ( !dynamic_cast<SDMS::Anon::NackReply*>( reply ))
                    m_auth = true;

                DL_INFO( "SDMS-FS auth = " << m_auth );

                delete reply;
            }

            m_ready = false;
            lock.unlock();
            m_cv.notify_one();
        }

        DL_INFO( "SDMS-FS main thread exiting" );
    };

    const MsgComm::SecurityContext &    m_sec_ctx;
    const string &                      m_core_addr;
    const string &                      m_repo_id;
    bool                                m_run;
    thread *                            m_thread;
    mutex                               m_mutex;
    condition_variable                  m_cv;
    const char *                        m_path;
    string                              m_uid;
    bool                                m_auth;
    string                              m_prefix;
    bool                                m_ready;
};


extern "C" {

static void * fuse_init( struct fuse_conn_info *conn )
{
    (void) conn;

    char hostname[HOST_NAME_MAX];
    gethostname( hostname, HOST_NAME_MAX );

    for ( int i = 0; i < 4; i++ )
        g_ready_queue.push( new CoreProxy( g_sec_ctx, hostname, g_repo_id, g_core_addr ) );

    return 0;
}

inline string prependPath( const char * a_path )
{
    return g_root_path + a_path;
}

static int fuse_getattr( const char * a_path, struct stat * a_stbuf )
{
    int res;

    res = lstat( prependPath( a_path ).c_str(), a_stbuf );
    if (res == -1)
        return -errno;

    return 0;
}

static int fuse_open( const char * a_path, struct fuse_file_info * a_fi )
{
    if (( a_fi->flags & O_RDONLY ) != O_RDONLY )
        return -EACCES;

    //DL_INFO( "SDMS-FS open" );
    string path = prependPath( a_path );
    CoreProxy * proxy = g_ready_queue.pop();
    bool auth = proxy->authorize( path.c_str(), g_domain + to_string( fuse_get_context()->uid ));
    g_ready_queue.push( proxy );

    if ( !auth )
        return -EACCES;

    int fd = open( path.c_str(), a_fi->flags );
    if (fd == -1)
        return -errno;

    a_fi->fh = fd;

    return 0;
}

static int fuse_read( const char * a_path, char * a_buf, size_t a_size, off_t a_offset, struct fuse_file_info * a_fi )
{
    (void) a_path;

    int res = pread( a_fi->fh, a_buf, a_size, a_offset );

    if (res == -1)
        return -errno;
    else
        return res;
}

static int fuse_read_buf( const char * a_path, struct fuse_bufvec ** a_bufp, size_t a_size, off_t a_offset, struct fuse_file_info * a_fi )
{
    struct fuse_bufvec *src;
    (void) a_path;

    src = (struct fuse_bufvec*) malloc( sizeof( struct fuse_bufvec ));
    if ( src == NULL )
        return -ENOMEM;

    *src = FUSE_BUFVEC_INIT( a_size );

    src->buf[0].flags = (fuse_buf_flags)( FUSE_BUF_IS_FD | FUSE_BUF_FD_SEEK );
    src->buf[0].fd = a_fi->fh;
    src->buf[0].pos = a_offset;

    *a_bufp = src;

    return 0;
}

/*
static int fuse_write( const char *path, const char *buf, size_t sz, off_t off, struct fuse_file_info *fi )
{
    (void) path;
    (void) buf;
    (void) sz;
    (void) off;
    (void) fi;
    return -EACCES;
}
*/

struct xmp_dirp
{
    DIR *dp;
    struct dirent *entry;
    off_t offset;
};

static inline struct xmp_dirp *get_dirp(struct fuse_file_info *fi)
{
    return (struct xmp_dirp *) (uintptr_t) fi->fh;
}

static int fuse_opendir(const char *path, struct fuse_file_info *fi)
{
    int res;
    struct xmp_dirp *d = new struct xmp_dirp;
    if (d == NULL)
        return -ENOMEM;

    d->dp = opendir( prependPath( path ).c_str() );
    if (d->dp == NULL) {
        res = -errno;
        delete d;
        return res;
    }

    d->offset = 0;
    d->entry = NULL;
    fi->fh = (unsigned long) d;

    return 0;
}

static int fuse_readdir(const char *path, void *buf, fuse_fill_dir_t filler, off_t offset, struct fuse_file_info *fi )
{
	struct xmp_dirp *d = get_dirp(fi);

	(void) path;
	if (offset != d->offset) {
#ifndef __FreeBSD__
		seekdir(d->dp, offset);
#else
		/* Subtract the one that we add when calling
		   telldir() below */
		seekdir(d->dp, offset-1);
#endif
		d->entry = NULL;
		d->offset = offset;
	}
	while (1) {
		struct stat st;
		off_t nextoff;
		//enum fuse_fill_dir_flags fill_flags = 0;

		if (!d->entry) {
			d->entry = readdir(d->dp);
			if (!d->entry)
				break;
		}
		#if 0
#ifdef HAVE_FSTATAT
		if (flags & FUSE_READDIR_PLUS) {
			int res;

			res = fstatat(dirfd(d->dp), d->entry->d_name, &st,
				      AT_SYMLINK_NOFOLLOW);
			if (res != -1)
				fill_flags |= FUSE_FILL_DIR_PLUS;
		}
#endif
		if (!(fill_flags & FUSE_FILL_DIR_PLUS)) {
			memset(&st, 0, sizeof(st));
			st.st_ino = d->entry->d_ino;
			st.st_mode = d->entry->d_type << 12;
		}
#endif
		nextoff = telldir(d->dp);
#ifdef __FreeBSD__		
		/* Under FreeBSD, telldir() may return 0 the first time
		   it is called. But for libfuse, an offset of zero
		   means that offsets are not supported, so we shift
		   everything by one. */
		nextoff++;
#endif
		if (filler(buf, d->entry->d_name, &st, nextoff /*, fill_flags*/ ))
			break;

		d->entry = NULL;
		d->offset = nextoff;
	}

	return 0;
}

static int fuse_releasedir(const char *path, struct fuse_file_info *fi)
{
    struct xmp_dirp *d = get_dirp(fi);
    (void) path;
    closedir(d->dp);
    delete d;
    return 0;
}

}

static struct fuse_operations xmp_oper = {};

string loadKeyFile( const std::string & a_key_file )
{
    string result;
    ifstream inf( a_key_file.c_str() );

    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 1, "Could not load key file: " << a_key_file );

    inf >> result;
    inf.close();

    return result;
}

int main( int argc, char ** argv )
{

    REG_PROTO( SDMS::Anon );

    xmp_oper.init       = fuse_init;
    xmp_oper.getattr    = fuse_getattr;
    xmp_oper.open       = fuse_open;
    xmp_oper.read       = fuse_read;
    xmp_oper.read_buf   = fuse_read_buf;
    //xmp_oper.write      = fuse_write;
    xmp_oper.opendir    = fuse_opendir;
    xmp_oper.readdir    = fuse_readdir;
    xmp_oper.releasedir = fuse_releasedir;

    try
    {
        DL_SET_ENABLED(true);
        DL_SET_LEVEL(DynaLog::DL_INFO_LEV);
        DL_SET_CERR_ENABLED(true);
        DL_SET_SYSDL_ENABLED(true);

        DL_INFO( "SDMS-FS file system starting" );

        string      cfg_file;
        string      cred_dir = "/etc/sdms/";
        string      mount_dir;

        g_core_addr = "tcp://sdms.ornl.gov:7512";
        g_root_path = "/data";
        g_domain = "sdmsdev";
        g_repo_id = "repo/core";

        namespace po = boost::program_options;

        po::options_description opts( "Options" );

        opts.add_options()
            ("help,?", "Show help")
            ("version,v", "Show version number")
            ("mount-dir,m",po::value<string>( &mount_dir ),"Mount directory")
            ("source-dir,s",po::value<string>( &g_root_path ),"Source directory")
            ("cred-dir,c",po::value<string>( &cred_dir ),"Server credentials directory")
            ("core-addr,a",po::value<string>( &g_core_addr ),"DataFed core service address")
            ("domain,d",po::value<string>( &g_domain ),"DataFed domain")
            ("repo-id,r",po::value<string>( &g_repo_id ),"DataFed repo ID")
            ("cfg",po::value<string>( &cfg_file ),"Use config file for options")
            ;

        po::positional_options_description p;
        p.add("mount-dir", -1);

        try
        {
            po::variables_map opt_map;
            po::store( po::command_line_parser( argc, argv ).options( opts ).positional(p).run(), opt_map );
            po::notify( opt_map );

            if ( opt_map.count( "help" ) )
            {
                cout << "SDMS Direct Access File Service, ver. " << VERSION << "\n";
                cout << "Usage: sdms-fs [options] mount-dir\n";
                cout << opts << endl;
                return 0;
            }

            if ( opt_map.count( "version" ))
            {
                cout << VERSION << endl;
                return 0;
            }

            if ( cfg_file.size() )
            {
                ifstream optfile( cfg_file.c_str() );
                if ( !optfile.is_open() )
                    EXCEPT_PARAM( 1, "Could not open config file: " << cfg_file );

                po::store( po::parse_config_file( optfile, opts, false ), opt_map );
                po::notify( opt_map );

                optfile.close();
            }

            if ( !mount_dir.size() )
                EXCEPT( 1, "Mount-dir must be specified" );
        }
        catch( po::unknown_option & e )
        {
            DL_ERROR( "Options error: " << e.what() );
            return 1;
        }

        if ( *cred_dir.rbegin() != '/' )
            cred_dir += "/";

        g_domain += ".";

        cout << "mount-dir: " << mount_dir << "\n";
        cout << "source-dir: " << g_root_path << "\n";
        cout << "cred-dir: " << cred_dir << "\n";
        cout << "core-addr: " << g_core_addr << "\n";
        cout << "domain: " << g_domain << "\n";
        cout << "repo-id: " << g_repo_id << "\n";

        g_sec_ctx.is_server = false;
        g_sec_ctx.public_key = loadKeyFile( cred_dir + "sdms-repo-key.pub" );
        g_sec_ctx.private_key = loadKeyFile( cred_dir + "sdms-repo-key.priv" );;
        g_sec_ctx.server_key = loadKeyFile( cred_dir + "sdms-core-key.pub" );;

        DL_SET_CERR_ENABLED(false);

        char * subargs[2] = { argv[0], (char*)mount_dir.c_str() };

        return fuse_main( 2, subargs, &xmp_oper, 0 );
    }
    catch( TraceException &e )
    {
        DL_ERROR( "Exception: " << e.toString() );
    }
    catch( exception &e )
    {
        DL_ERROR( "Exception: " << e.what() );
    }
}