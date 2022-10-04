#ifndef DATAFED_COMMON_PASSKEY_HPP
#define DATAFED_COMMON_PASSKEY_HPP
#pragma once

namespace datafed {
	template <class T> class PassKey {
		private:
			PassKey() {}
			PassKey(const PassKey &) {}
			PassKey &operator=(const PassKey &) = delete;
			friend T;
	};
}

#endif // DATAFED_COMMON_PASSKEY_HPP
