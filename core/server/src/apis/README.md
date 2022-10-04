# The different APIs we can communicate with

For instance the Globus API, if we wanted to communicate with GitHub

The API tells us what operations are available not how the communication occurs

Each API should have a way to translate data into an intermediate format that
can then be translated into any other api format if necessary.

Every time a request is made to an API, a protocol is passed in, this 
protocol is in charge of packaing the data in with the correct formatting, but
the actual requirements of the API may be different.

So for instance say I want to communicate with the DataFed web server, I could
probably use the ZeroMQ protocol or the HTTP protocol, it doesn't matter, but
the actual package that I need to send may be different.
