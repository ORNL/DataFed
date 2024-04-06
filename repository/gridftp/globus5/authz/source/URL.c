#include <stdio.h>
#include <string.h>

#include "URL.h"

// Function to extract the relative path from an FTP URL
// Returns 1 on success, 0 on failure
int ftpExtractRelativePath(const char *url, char *relativePath,
                           size_t maxLength) {
  size_t len_of_prefix = strlen("ftp://");
  size_t len_of_url = strlen(url);

  // Step 1. Check that the URL starts with "ftp://"
  if (strncmp(url, "ftp://", len_of_prefix) != 0) {
    fprintf(stderr,
            "Error: URL must start with 'ftp:// but you have provided %s'\n",
            url);
    return 0;
  }

  if (len_of_url == len_of_prefix) {
    // This means we have ftp:// but with no relative path and missing
    // the final / separating the domain from the relative path.
    fprintf(stderr,
            "Error: Invalid URL format expected ftp://domain/ instead received "
            "%s\n",
            url);
    return 0;
  } else if (url[len_of_prefix] == '/') {
    // If they are not equal the url must be greater because we already
    // compared the prefix. Let's make sure we don't have
    // ftp:/// where no domain is given this is invalid as well
    //
    // NOTE the third / will appear at index 6 not 7
    fprintf(stderr,
            "Error: Invalid URL format missing domain name expected "
            "ftp://domain/ instead received %s\n",
            url);
    return 0;
  }
  // Find the position of the third slash ('/') after "ftp://"
  const char *slashPtr = strchr(url + len_of_prefix, '/');
  if (slashPtr == NULL) {
    if (len_of_url == len_of_prefix) {
      // This means we have ftp:// but with no relative path and missing
      // the final / separating the domain from the relative path.
      fprintf(stderr,
              "Error: Invalid URL format expected ftp://domain/ instead "
              "received %s\n",
              url);
      return 0;
    } else {
      // This means we have ftp://domain but with no relative path and missing
      // the final / separating the domain from the relative path. We will
      // report this as a success and return a slash
      relativePath[0] = '/';
      relativePath[1] = '\0';
      return 1;
    }
  }

  printf("slashPtr is %s\n", slashPtr);
  // Calculate the length of the relative path
  size_t pathLength = strlen(slashPtr);

  // Check if the provided buffer is sufficient
  if (pathLength >= maxLength) {
    fprintf(
        stderr,
        "Error: Insufficient buffer size max size is %ld actual size is %ld\n",
        maxLength, pathLength);
    return 0;
  }

  // Copy the relative path to the output buffer
  strcpy(relativePath, slashPtr);

  return 1; // Success
}

int comparePrefix(const char *str1, const char *str2, size_t prefix_length) {
  size_t len1 = strlen(str1);
  size_t len2 = strlen(str2);

  // Ensure the prefix length is not longer than the shortest string length
  if (prefix_length > len1 || prefix_length > len2) {
    return -1; // Prefix length is longer than one or both of the strings
  }

  // Compare the prefixes
  return strncmp(str1, str2, prefix_length);
}
