libsdmsclient.a: Client.o
	ar r libsdmsclient.a Client.o

Client.o: Client.cpp Client.hpp ../../../libcommon/libsdmscommon.a
	g++ -std=c++11 -O2 -c -I../../common -I../../../libcommon -I/usr/include/globus -fPIC Client.cpp

.PHONY: clean

clean:
	rm -f *.o *.a
