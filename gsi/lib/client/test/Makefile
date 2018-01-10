client: client.cpp ../sdmsclient.hpp ../sdmsclient.cpp
	g++ -O2 -oclient -I.. client.cpp -L../ -lsdmsclient -lcurl -lglobus_common -lglobus_gss_assist -lglobus_gssapi_gsi

.PHONY: clean

clean:
	rm *.o client
