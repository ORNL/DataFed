libsdms_gsi_authz.so: libsdms_gsi_authz.o
	gcc -shared -olibsdms_gsi_authz.so libsdms_gsi_authz.o

libsdms_gsi_authz.o: libsdms_gsi_authz.c
	gcc -O2 -c -I/usr/include/globus -fPIC libsdms_gsi_authz.c

.PHONY: clean

clean:
	rm *.o *.so
