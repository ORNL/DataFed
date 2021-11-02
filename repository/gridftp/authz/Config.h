#ifndef CONFIG_H
#define CONFIG_H

#define MAX_ADDR_LEN 200
#define MAX_ID_LEN   80
#define MAX_PATH_LEN 500
#define MAX_KEY_LEN  100

struct Config
{
    char    repo_id[MAX_ID_LEN];
    char    server_addr[MAX_ADDR_LEN];
    char    pub_key[MAX_KEY_LEN];
    char    priv_key[MAX_KEY_LEN];
    char    server_key[MAX_KEY_LEN];
    char    user[MAX_ID_LEN];
    char    test_path[MAX_PATH_LEN];
    size_t  timeout;
};

#endif
