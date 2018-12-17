#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <dirent.h>
#include <fstream>
#include <string>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>

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

MsgComm::SecurityContext    g_sec_ctx;

class CoreProxy
{
public:
    CoreProxy() : m_run(true), m_path(0), m_uid(0), m_ready( false )
    {
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

    bool authorize( const char *a_path, int a_uid )
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
        MsgComm comm( "tcp://sdms.ornl.gov:7512", MsgComm::DEALER, false, &g_sec_ctx );

        SDMS::Auth::RepoAuthzRequest    request;
        MsgBuf::Message *               reply;
        //Anon::NackReply *               nack;
        MsgBuf::Frame                   frame;
        string                          client;

        request.set_repo("core");
        request.set_action("read");

        unique_lock<mutex> lock(m_mutex,defer_lock);

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

            request.set_file( m_path );
            request.set_client( to_string( m_uid ));

            comm.send( request );

            if ( !comm.recv( reply, client, frame, 10000 ))
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

    bool                m_run;
    thread *            m_thread;
    mutex               m_mutex;
    condition_variable  m_cv;
    const char *        m_path;
    int                 m_uid;
    bool                m_auth;
    bool                m_ready;
};

Queue<CoreProxy*>           g_ready_queue;

extern "C" {

static void * fuse_init( struct fuse_conn_info *conn )
{
    (void) conn;

    for ( int i = 0; i < 4; i++ )
        g_ready_queue.push( new CoreProxy() );

    return 0;
}

static int fuse_getattr( const char *path, struct stat *stbuf )
{
    int res;

    res = lstat(path, stbuf);
    if (res == -1)
        return -errno;

    return 0;
}

static int fuse_open( const char *path, struct fuse_file_info *fi )
{
    if (( fi->flags & O_RDONLY ) != O_RDONLY )
        return -EACCES;

    DL_INFO( "SDMS-FS open" );

    CoreProxy * proxy = g_ready_queue.pop();
    bool auth = proxy->authorize( path, fuse_get_context()->uid );
    g_ready_queue.push( proxy );

    if ( !auth )
        return -EACCES;

    int fd = open( path, fi->flags );
    if (fd == -1)
        return -errno;

    fi->fh = fd;

    return 0;
}

static int fuse_read(const char *path, char *buf, size_t size, off_t offset, struct fuse_file_info *fi)
{
    (void) path;

    int res = pread( fi->fh, buf, size, offset );

    if (res == -1)
        return -errno;
    else
        return res;
}

static int fuse_read_buf(const char *path, struct fuse_bufvec **bufp, size_t size, off_t offset, struct fuse_file_info *fi)
{
    struct fuse_bufvec *src;
    (void) path;

    src = (struct fuse_bufvec*)malloc(sizeof(struct fuse_bufvec));
    if (src == NULL)
        return -ENOMEM;

    *src = FUSE_BUFVEC_INIT(size);

    src->buf[0].flags = (fuse_buf_flags)( FUSE_BUF_IS_FD | FUSE_BUF_FD_SEEK );
    src->buf[0].fd = fi->fh;
    src->buf[0].pos = offset;

    *bufp = src;

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
    //struct xmp_dirp *d = malloc(sizeof(struct xmp_dirp));
    struct xmp_dirp *d = new struct xmp_dirp;
    if (d == NULL)
        return -ENOMEM;

    d->dp = opendir(path);
    if (d->dp == NULL) {
        res = -errno;
        delete d; //free(d);
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
    delete d; //free(d);
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
    DL_SET_SYSDL_ENABLED( true )

    g_sec_ctx.is_server = false;
    g_sec_ctx.public_key = loadKeyFile( "/etc/sdms/sdms-repo-key.pub" );
    g_sec_ctx.private_key = loadKeyFile( "/etc/sdms/sdms-repo-key.priv" );;
    g_sec_ctx.server_key = loadKeyFile( "/etc/sdms/sdms-core-key.pub" );;

    REG_PROTO( SDMS::Anon );

    //umask(0);
    xmp_oper.init       = fuse_init;
    xmp_oper.getattr    = fuse_getattr;
    xmp_oper.open       = fuse_open;
    xmp_oper.read       = fuse_read;
    xmp_oper.read_buf   = fuse_read_buf;
    //xmp_oper.write      = fuse_write;
    xmp_oper.opendir    = fuse_opendir;
    xmp_oper.readdir    = fuse_readdir;
    xmp_oper.releasedir = fuse_releasedir;

    /*cout << "Calling fuse_open\n";
    fuse_file_info fi;
    fi.flags = 0;
    fuse_open("/fubar", &fi );
    cout << "back!\n";
    return 0;*/
    return fuse_main( argc, argv, &xmp_oper, 0 );
}