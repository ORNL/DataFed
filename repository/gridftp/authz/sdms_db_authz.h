#ifndef _test_authz_
#define _test_authz_h_
#ifdef __cplusplus
extern "C" {
#endif
const char * getVersion();
int authzdb(char * client_id, char * object, char * action);
#ifdef __cplusplus
}
#endif
#endif