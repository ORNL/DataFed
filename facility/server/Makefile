sdmsd: FacilityServer.cpp FacilityServer.hpp main.cpp ../../libcommon/libsdmscommon.a
	g++ -std=c++11 -O2 -osdmsd -D USE_DYNALOG -I/usr/include/globus -I../common -I../../libcommon FacilityServer.cpp main.cpp -L../../libcommon -lsdmscommon -lzmq -lprotobuf -lcurl -lglobus_common -lglobus_gss_assist -lglobus_gssapi_gsi -lpthread

.PHONY: clean

clean:
	rm -f *.o sdmsd
