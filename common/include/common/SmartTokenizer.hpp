#ifndef SMARTTOKENIZER_HPP
#define SMARTTOKENIZER_HPP

#include <string>
#include <vector>

template <char delim = ' ', bool keep_empty = false> class SmartTokenizer {
public:
  typedef std::vector<const char *> value_t;
  typedef value_t::iterator iter_t;
  typedef value_t::const_iterator const_iter_t;

  SmartTokenizer() {}

  explicit SmartTokenizer(const std::string &a_input_str) {
    m_buffer.reserve(a_input_str.size());
    _parse(a_input_str.c_str(), a_input_str.size());
  }

  SmartTokenizer(const char *a_input_str, size_t a_len) {
    m_buffer.reserve(a_len);
    _parse(a_input_str, a_len);
  }

  ~SmartTokenizer() {}

  void parse(const std::string &a_input_str) {
    m_buffer.clear();
    m_buffer.reserve(a_input_str.size());
    m_tokens.clear();
    _parse(a_input_str.c_str(), a_input_str.size());
  }

  void parse(const char *a_input_str, size_t a_len) {
    m_buffer.clear();
    m_buffer.reserve(a_len);
    m_tokens.clear();
    _parse(a_input_str, a_len);
  }

  inline value_t &tokens() { return m_tokens; }

  inline const_iter_t begin() { return m_tokens.begin(); }

  inline const_iter_t end() { return m_tokens.end(); }

private:
  void _parse(const char *a_input_str, size_t a_len) {
    const char *r = a_input_str;
    const char *e = a_input_str + a_len;
    char *w = &m_buffer[0];
    char nc;
    char state = 0;
    bool esc = false;

    for (; r != e; ++r) {
      // Check for escape sequence
      if (*r == '\\') {
        nc = *(r + 1);
        if (nc == '\"' || nc == '\'' || nc == '\\') {
          ++r;
          esc = true;
        }
      }

      switch (state) {
      case 0: // Looking for token
        if (*r == '\'' && !esc)
          state = 1;
        else if (*r == '\"' && !esc)
          state = 2;
        else if (*r != delim) {
          *w = *r;
          m_tokens.push_back(w++);
          state = 3;
        } else if (keep_empty) {
          *w = 0;
          m_tokens.push_back(w++);
        }
        break;
      case 1: // Start of single quoted string
        if (*r == '\'' && !esc)
          state = 0;
        else {
          *w = *r;
          m_tokens.push_back(w++);
          state = 11;
        }
        break;
      case 11: // Inside single quotes
        if (*r == '\'' && !esc)
          state = 3;
        else
          *w++ = *r;
        break;
      case 2: // Start of double quoted string
        if (*r == '\"' && !esc)
          state = 0;
        else {
          *w = *r;
          m_tokens.push_back(w++);
          state = 22;
        }
        break;
      case 22: // Inside double quotes
        if (*r == '\"' && !esc)
          state = 3;
        else
          *w++ = *r;
        break;
      case 3: // Unquoted token
        if (*r == delim) {
          *w++ = 0;
          state = 0;
        } else if (*r == '\'' && !esc)
          state = 11;
        else if (*r == '\"' && !esc)
          state = 22;
        else
          *w++ = *r;
        break;
      }

      esc = false;
    }
    *w = 0;
    if (state == 0 && keep_empty) {
      m_tokens.push_back(w++);
    }
  }

  std::string m_buffer;
  std::vector<const char *> m_tokens;
};

#endif
