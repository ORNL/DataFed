libsdmscommon.a: Connection.o
	ar r libsdmscommon.a Connection.o

Connection.o: Connection.cpp Connection.hpp
	g++ -std=c++11 -O2 -c -fPIC Connection.cpp

.PHONY: clean

clean:
	rm *.o *.a
