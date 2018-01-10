libsdmsclient.a: sdmsclient.o
	ar r libsdmsclient.a sdmsclient.o

sdmsclient.o: sdmsclient.cpp sdmsclient.hpp
	g++ -O2 -c -I/usr/include/globus -fPIC sdmsclient.cpp

.PHONY: clean

clean:
	rm *.o *.a
