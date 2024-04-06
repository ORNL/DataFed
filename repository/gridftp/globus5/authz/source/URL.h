#include <stdio.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Function to extract the relative path from an FTP URL
 *
 * Will take a uri of the form ftp://domain/path/to/file
 *
 * If the URI has the prefix
 *
 * ftp://domain Returns 1 for success
 *              else it will return 0 for failure
 **/
int ftpExtractRelativePath(const char *url, char *relativePath,
                           size_t maxLength);

/**
 * Will compare two strings and ensure that prefixes are equivalent
 *
 * On success will return the results of strncmp which will be 0 if they
 * match.
 **/
int comparePrefix(const char *str1, const char *str2, size_t prefix_length);

#ifdef __cplusplus
}
#endif
