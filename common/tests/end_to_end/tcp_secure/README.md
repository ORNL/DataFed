# TCP Secure Test

## Explanation

This test is designed to test the send and receive calls using the zeromq tcp
protocol, it requires that both the client and server are running at the same
time. They cannot be running as threads but must be separate processes.
