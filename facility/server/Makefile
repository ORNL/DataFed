sdmsd: FacilityServer.cpp FacilityServer.hpp main.cpp
	g++ -std=c++11 -O2 -osdmsd -I/usr/include/globus -I../../libcommon FacilityServer.cpp main.cpp -L../../libcommon -lsdmscommon -lzmq -lcurl -lglobus_common -lglobus_gss_assist -lglobus_gssapi_gsi

.PHONY: clean

clean:
	rm *.o client
