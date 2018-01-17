test: main.cpp ../Client.hpp ../Client.cpp ../libsdmsclient.a
	g++ -std=c++11 -O2 -otest -I.. -I../../../../libcommon main.cpp -L../ -lsdmsclient -L../../../../libcommon -lsdmscommon -lzmq -lglobus_common -lglobus_gss_assist -lglobus_gssapi_gsi

.PHONY: clean

clean:
	rm -f *.o test
