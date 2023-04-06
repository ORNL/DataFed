# TCP Secure Test

## Explanation

This test is designed to test the send and receive calls using the zeromq tcp
protocol, it requires that both the client and server are running at the same
time. They cannot be running as threads but must be separate processes.

To test that CURVE is implemented securely you can run both the client and
server executables after starting a network sniffer like tcpdump

Terminal 1 - Start network sniffer
$ sudo tcpdump -c 18 -vvv -A -i lo | grep token

Terminal 2 - Start server
$ ./test_tcp_secure_server

Terminal 3 - Start client
$ ./test_tcp_secure_client

If the connection is secure then tcpdump will be unable to find anything matching
the token string. If however the connection is insecure and the communication
is not encrypted grepping the packages will return ".magic_token".

NOTE: Running the security tests from cmake is non trivial because the network 
sniffer requires sudo permissions. You can grant network permissions with the 
following lines of code. Security testing should be done in a sandboxed env.

sudo groupadd pcap
sudo usermod -a -G pcap $USER

sudo chgrp pcap /usr/sbin/tcpdump
sudo chmod 750 /usr/sbin/tcpdump

sudo setcap cap_net_raw,cap_net_admin=eip /usr/sbin/tcpdump
