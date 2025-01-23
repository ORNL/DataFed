
#ifndef UTIL_H
#define UTIL_H
// Standard includes
#include <stdbool.h>

/**
 * @brief Converts a 16-byte UUID into a canonical string representation.
 *
 * This function takes a 16-byte binary UUID and converts it into a standard
 * UUID string format (e.g., "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"), where
 * each 'x' represents a hexadecimal digit and the hyphens separate the UUID
 * sections as per the canonical format.
 *
 * @param[in] a_uuid Pointer to an array containing 16 bytes of the UUID in
 * binary format.
 * @param[out] a_out Pointer to a pre-allocated character array to hold the
 * resulting string. This array must have at least 37 bytes of space to store
 * the 36-character UUID string plus the null terminator.
 *
 * The function processes the input UUID byte by byte, converting each byte into
 * its hexadecimal representation and placing it into the output string. It
 * inserts hyphens at specific positions to separate the UUID sections. Finally,
 * it appends a null terminator to ensure the output is a valid C string.
 */
void uuidToStr(unsigned char *a_uuid, char *a_out);

/**
 * @brief Decodes a Base32-encoded string into a UUID string.
 *
 * This function decodes a Base32-like encoded string using a custom vocabulary
 * and converts it into a 16-byte binary UUID format. The result is then
 * converted to the canonical UUID string format.
 *
 * @param[in] a_input The Base32-encoded input string to decode.
 * @param[out] a_uuid A pre-allocated buffer for the decoded UUID string in
 *                    canonical format (36 characters + null terminator).
 *                    The buffer must have a size of at least 37 bytes.
 * @return true if the input string is valid and decoding succeeds; false
 * otherwise.
 *
 * @note The input string must be a multiple of 8 characters for proper
 * decoding.
 *
 * Example usage:
 * @code
 * char uuid[37];
 * if (decodeUUID("abcd1234efgh5678ijklmnopqrstu345", uuid)) {
 *     printf("Decoded UUID: %s\n", uuid);
 * } else {
 *     printf("Invalid input.\n");
 * }
 * @endcode
 */
bool decodeUUID(const char *a_input, char *a_uuid);

#endif // UTIL_H
