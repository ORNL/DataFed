// Private local includes
#include "Util.h"

// Standard includes
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void uuidToStr(unsigned char *a_uuid, char *a_out) {
  static const char *hex =
      "0123456789abcdef"; ///< Lookup table for hexadecimal digits.
  static const char *form =
      "xxxx-xx-xx-xx-xxxxxx"; ///< Format template for UUID sections.

  unsigned char *pend =
      a_uuid + 16;    ///< Pointer to the end of the input UUID array.
  char *pout = a_out; ///< Pointer to the current position in the output string.
  const char *f =
      form + 1; ///< Pointer to the current position in the format template.

  for (unsigned char *pin = a_uuid; pin != pend; pout += 2, pin++, f++) {
    // Convert the high and low nibbles of the current byte to hexadecimal
    // characters.
    pout[0] = hex[(*pin >> 4) & 0xF];
    pout[1] = hex[*pin & 0xF];

    // If the format template specifies a hyphen, add it to the output.
    if (*f == '-') {
      pout[2] = '-';
      pout++;
      f++;
    }
  }

  // Append a null terminator to the output string.
  pout[0] = 0;
}

bool decodeUUID(const char *a_input, char *a_uuid) {
  static char vocab[33] = "abcdefghijklmnopqrstuvwxyz234567";
  uint64_t word;
  const char *iter;
  const char *end = vocab + 32;
  size_t len = strlen(a_input);
  char c;
  unsigned long v;
  unsigned char out[16];
  unsigned char *outp = out;
  size_t out_len = 0;
  size_t i, j;
  if (len == 0) {
    return false;
  }

  for (i = 0; i < len; i += 8) {
    word = 0;
    for (j = 0; j < 8; ++j) {
      if (i + j < len) {
        c = a_input[i + j];
        for (iter = vocab; iter != end; ++iter) {
          if (*iter == c) {
            v = (iter - vocab);
            break;
          }
        }

        if (iter == end)
          return false;

        word <<= 5;
        word |= v;
      } else {
        word <<= 5 * (8 - j);
        break;
      }
    }

    for (j = 0; j < 5 && out_len < 16; ++j, ++out_len)
      *outp++ = ((word >> ((4 - j) * 8)) & 0xFF);
  }

  uuidToStr(out, a_uuid);

  return true;
}
