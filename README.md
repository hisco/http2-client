# HTTP2 client

[![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]

Transparently make http request to both http1 / http2 server.

## Purpose
http2 in Node.JS works entirly different, while in browsers the experience is the same.
`http2-client` was created to enable http2 / http1.1 requests with the same interface as http1.1.
Meaning you don't need to know which protocol the destination supports before making the request `http2-client` will chose the one that works.

## Usage - Same interface
```js
const {request} = require('http-client');
const h1Target = 'http://www.example.com/';
const h2Target = 'https://www.example.com/';
const req1 = request(h1Target, (res)=>{
    console.log(`
Url : ${h1Target}
Status : ${res.statusCode}
HttpVersion : ${res.httpVersion}
    `);
});
req1.end();

const req2 = request(h2Target, (res)=>{
    console.log(`
Url : ${h2Target}
Status : ${res.statusCode}
HttpVersion : ${res.httpVersion}
    `);
});
req2.end();
```

## How?
`http2-client` implements 'Application-Layer Protocol Negotiation (ALPN)'.
Which means it first creates TCP connection, after succeful ALPN negotiation the supported protocol is known.

If the supported protocol is http2.0 `http2-client` will re-use the same connection.
After the http2.0 connection won't be used for `keepH2ConnectionFor` which defaults to 100 ms, it will be automatically.

If the supported protocol is http1.x `http2-client` will only cache the identification result and not the actual socket.
Any socket configuration is manged by the http agent.
If non will be defined the node `globalAgent` will be used. 


## License

  [MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/http2-client.svg
[npm-url]: https://npmjs.org/package/http2-client
[travis-image]: https://img.shields.io/travis/hisco/http2-client/master.svg?style=flat-square
[travis-url]: https://travis-ci.org/hisco/http2-client