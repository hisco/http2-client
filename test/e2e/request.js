const { HttpRequestManager , request } = require('../../lib/index');
const {Http2Debug} = require('http2-debug');

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-spies'));

const http = require('http');
const SERVER_HOST = '0.0.0.0';

const HTTP_PORT = 8080;
const HTTP2_PORT = 8443;

const HTTP_URL = `http://${SERVER_HOST}:${HTTP_PORT}`;
const HTTP2_URL = `https://${SERVER_HOST}:${HTTP2_PORT}`;

const serverCloseActions = [];

const onHttpServerReady = new Promise((resolve , reject)=>{
    try{
        const server = http.createServer((req, res) => {
            getBody(req)
            .then((bodyRaw)=>{
                const body = JSON.parse(bodyRaw ? bodyRaw : "{}");
                const headers = req.headers;

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    body,
                    headers
                }));
            })
            .catch((err)=>{
                res.status(500).end('')
            })
        });
        server.listen(HTTP_PORT,SERVER_HOST, (err) => {
            if (err)
                return reject(err);

            serverCloseActions.push(server.close.bind(server));
            resolve()
        });
    }
    catch(err){
        reject(err);
    }
});
const onHTTP2ServerReady = new Promise((resolve , reject)=>{
    http2Debug = new Http2Debug;
    http2Debug.createServer((err)=>{
        if (err)
            return reject(err);
        resolve();
        serverCloseActions.push(http2Debug.stopServer.bind(http2Debug));
    });
})
// process.on('unhandledRejection', (reason, p) => {
//     console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
//     // application specific logging, throwing an error, or other logic here
//   });
//   process.on('uncaughtException', err => {
//     console.error(err, 'Uncaught Exception thrown');
//   });
describe('request' , ()=>{
    before(()=>{
        return Promise.all([
            onHTTP2ServerReady,
            onHttpServerReady
        ])
    })
    describe('http1' , ()=>{
        it('Should be able to make request with request options string' , ()=>{
            return new Promise((resolve , reject)=>{
                const req = request(HTTP_URL , (res)=>{
                    getBody(res)
                    .then((bodyRaw)=>{
                        const json = JSON.parse(bodyRaw);
                        resolve()
                    })
                    .catch((err)=>{
                        reject(err)
                    })
                });
                req.end();
            })
        });
        it('Should be able to make request with request options' , ()=>{
            return new Promise((resolve , reject)=>{
                const req = request({
                    path : '/test',
                    host : SERVER_HOST,
                    port : HTTP_PORT
                } , (res)=>{
                    getBody(res)
                    .then((bodyRaw)=>{
                        const json = JSON.parse(bodyRaw);
                        resolve()
                    })
                    .catch((err)=>{
                        reject(err)
                    })
                });
                req.end();
            })
        });
        it('Should be able to make request with request options' , ()=>{
            return new Promise((resolve , reject)=>{
                const req = request({
                    path : '/test',
                    host : SERVER_HOST,
                    port : HTTP_PORT,
                    headers : {
                        'tesT-me' :'90'
                    }
                } , (res)=>{
                    getBody(res)
                    .then((bodyRaw)=>{
                        const json = JSON.parse(bodyRaw);
                        resolve(json)
                    })
                    .catch((err)=>{
                        reject(err)
                    })
                });
                req.end();
            })
            .then((json)=>{
                return expect(json.headers['test-me']).eq('90')
            })
        });
    })
    describe('http2' , ()=>{
        it('Should be able to make request with request options string' , ()=>{
            return new Promise((resolve , reject)=>{
                const req = request('https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty' , (res)=>{
                    req
                getBody(res)
                    .then((bodyRaw)=>{
                        // const json = JSON.parse(bodyRaw);
                        resolve()
                    })
                    .catch((err)=>{
                        reject(err)
                    })
                });
                req.end();
            })
        });
        it('Should be able to make request with request options' , ()=>{
            return new Promise((resolve , reject)=>{
                const req = request({
                    path : '/test',
                    protocol : 'https:',
                    host : SERVER_HOST,
                    port : HTTP2_PORT
                } , (res)=>{
                    getBody(res)
                    .then((bodyRaw)=>{
                        const json = JSON.parse(bodyRaw);
                        resolve()
                    })
                    .catch((err)=>{
                        reject(err)
                    })
                });
                req.end();
            })
        });
        it('Should be able to make request with request options' , ()=>{
            return new Promise((resolve , reject)=>{
                const req = request({
                    path : '/test',
                    host : SERVER_HOST,
                    protocol : 'https:',
                    port : HTTP2_PORT,
                    headers : {
                        'tesT-me' :'90'
                    }
                } , (res)=>{
                    getBody(res)
                    .then((bodyRaw)=>{
                        const json = JSON.parse(bodyRaw);
                        resolve(json)
                    })
                    .catch((err)=>{
                        reject(err)
                    })
                });
                req.end();
            })
            .then((json)=>{
                return expect(json.headers['test-me']).eq('90')
            })
        });
        it('Should be able to make request with request options' , ()=>{
            return new Promise((resolve , reject)=>{
                const req = request({
                    path : '/test',
                    host : SERVER_HOST,
                    method : 'POST',
                    protocol : 'https:',
                    port : HTTP2_PORT,
                    headers : {
                        'tesT-me' :'90'
                    }
                } , (res)=>{
                    getBody(res)
                    .then((bodyRaw)=>{
                        const json = JSON.parse(bodyRaw);
                        resolve(json)
                    })
                    .catch((err)=>{
                        reject(err)
                    })
                });
                req.write('{"key":')
                req.end('"value"}');
            })
            .then((json)=>{
                expect(json.headers['test-me']).eq('90') 
                expect(json.headers[':method']).eq('POST') 
            })
        });
    })
    after(()=>{
        serverCloseActions.forEach((action)=>{
            action();
        })
    })
});

function getBody(stream){
    return new Promise((resolve , reject)=>{
        let bodyRaw = '';
        stream.on('data' , (chunk)=>{
            bodyRaw+=chunk;
        });
        stream.on('end',(chunk)=>{
            if (chunk)
                bodyRaw+=chunk;
            resolve(bodyRaw);
        });
        stream.on('error' , (err)=>{
            reject(err)
        })
    })
}
