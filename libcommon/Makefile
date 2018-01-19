libsdmscommon.a: Connection.o SDMS.pb.o Facility.pb.o
	ar r libsdmscommon.a Connection.o SDMS.pb.o Facility.pb.o

Connection.o: Connection.cpp Connection.hpp SDMS.pb.cpp
	g++ -std=c++11 -O2 -c -fPIC Connection.cpp

Facility.pb.o:  Facility.pb.cpp
	g++ -std=c++11 -O2 -c -fPIC Facility.pb.cpp

SDMS.pb.o: SDMS.pb.cpp
	g++ -std=c++11 -O2 -c -fPIC SDMS.pb.cpp

SDMS.pb.cpp: SDMS.proto
	protoc --cpp_out=. SDMS.proto
	mv SDMS.pb.cc SDMS.pb.cpp

Facility.pb.cpp: Facility.proto SDMS.proto
	protoc --cpp_out=. Facility.proto
	mv Facility.pb.cc Facility.pb.cpp

.PHONY: clean

clean:
	rm -f *.o *.a *.pb.h *.pb.cpp
