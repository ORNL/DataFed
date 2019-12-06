#include <TaskMgr.hpp>

using namespace std;

namespace SDMS {
namespace CORE {

class TaskMgr::Task
{
public:
};


TaskMgr::TaskMgr()
{
}

TaskMgr::~TaskMgr()
{
}

TaskMgr &
TaskMgr::getInstance()
{
    static TaskMgr * mgr = new TaskMgr();

    return *mgr;
}


void
TaskMgr::getData( const std::vector<std::string> & a_ids, const std::string & a_path, XfrEncrypt a_encrypt )
{
}


void
TaskMgr::putData( const std::string& a_id, const std::string & a_path, XfrEncrypt a_encrypt, const std::string * a_ext )
{
}


void
TaskMgr::moveData( const std::vector<std::string> & a_ids, const std::string & a_repo, XfrEncrypt a_encrypt )
{
}


void
TaskMgr::deleteData( const std::vector<std::string> & a_ids )
{
}


void
TaskMgr::xfrMonitor()
{
}


}}
