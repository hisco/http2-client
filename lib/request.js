
const stream = require('stream');
const { URL ,format} = require('url');
const {EventEmitter} = require('events');
const _extend = require('util')._extend;
const {DebounceTimers , assertIsObject , ERR_INVALID_ARG_TYPE} = require('./utils');
const {initializeTLSOptions , initializeOptions} = require('./request-options');

const STUBBED_METHODS_NAME = [
  'write',
  'end',
  'pipe',
  'emit',
  'removeListener',
  'removeListeners',
  'setTimeout',
  'setEncoding',
  'close',
  'priority',
  'sendTrailers',
];
const PROPERTIES_TO_PROXY = [
  // 'aborted',
  // 'closed',
  // 'destroyed',
  // 'pending',
  // 'rstCode',
  // 'sentHeaders',
  // 'sentInfoHeaders',
  // 'sentTrailers',
  // 'session',
  // 'state',
  'httpVersionMajor',
  'httpVersionMinor',
  'httpVersion',
];
const $stubs = Symbol('stubs');
class HTTP2OutgoingMessage{
  constructor(){
    this[$stubs] = [];
    for (var i=0;i<STUBBED_METHODS_NAME.length;i++){
      let name = STUBBED_METHODS_NAME[i];
      this[name] = function method(){
        return this.genericStubber(name , arguments);
      }.bind(this)
    }
  }
  genericStubber(method , args){
    if (this[$stubs ]){
      this[$stubs].push([method,args]);
      return true;
    }
    else
      return this[method](...arguments);
  }
  on(eventName , cb){
    if (eventName == 'response'){
      if (!cb.http2Safe){
        eventName = 'http1.response';
        arguments[0] = eventName;
      }
    }
    if (this._on){
      this._on(...arguments);
    }
    else
      this.genericStubber('on' , arguments);

  }
  once(eventName , cb){
    if (eventName == 'response'){
      if (!cb.http2Safe){
        eventName = 'http1.response';
      }
    }
    if (this._once){
      this._once(...arguments);
    }
    else
      this.genericStubber('once' , arguments);

  }
  abort(cb){
    this.close(0x08 , cb);
  }
  take(stream){
    for (var i=0;i<STUBBED_METHODS_NAME.length;i++){
      let name = STUBBED_METHODS_NAME[i];
      if (stream[name])
        this[name] = stream[name].bind(stream);
    }
    this.proxyProps(stream);
    //This should come later in case of user exception
    for (let i = 0; i<this[$stubs ].length;i++){
      var stub = this[$stubs ][i];
      stream[stub[0]](...stub[1]);
    }
    this[$stubs ] = null;
  }
  proxyProps(http2Stream){
    function getter(){
      return http2Stream[this];
    }
    function setter(value){
      http2Stream[this] = value;
    }
    const notToProxy = [].concat(STUBBED_METHODS_NAME);
    const keys = Object.keys(this);
    const keysToProxy = [].concat(PROPERTIES_TO_PROXY);
    keys.forEach(function whichProxyKeys(key){
      if (notToProxy.indexOf(key) == -1 && keysToProxy.indexOf(key)==-1){
        keysToProxy.push(key)
      }
    });
    const properties = Object.getOwnPropertyDescriptors(http2Stream);
    for (var i=0;i<keysToProxy.length;i++){
      let name = keysToProxy[i];
      const propConfig = properties[name];
      let shouldCopyValue;
      if (!propConfig)
        shouldCopyValue = true;
      if (propConfig && (propConfig.writable || propConfig))
        shouldCopyValue = true;
      
      if (shouldCopyValue)
        http2Stream[name] = this[name];

      Object.defineProperty(this , name , {
        get : getter.bind(name),
        set : setter.bind(name),
      })
    }
      
  }
}

class HttpRequestManager extends EventEmitter{
  constructor(options){
    super(); 
    this.init(options);
  }
  log(){
  }
  init(options){
    options = options || {};
    this.http2Clients = {};
    this.cachedHTTP1Result = {};
    this.setModules();
    this.http2Debouncer = new DebounceTimers(function stopConnection(key){
      this.log('stopping ' , key);
      var foundConnection = this.http2Clients[key];
      if (foundConnection){
        this.removeHttp2Client(key , foundConnection)
      }
    }.bind(this) , 1000);

    this.keepH1IdentificationCacheFor = options.keepH1IdentificationCacheFor || 30000;
    this.http2Debouncer.setDelay(options.keepH2ConnectionFor);
  }
  setModules(){
    [
        'http',
        'https',
        'tls',
        'net'
    ].forEach(mName => this.loadModule(mName));
    this.http2Support = false;
    try{
      this.loadModule('http2');
      this.http2Support = true;
    }
    catch(err){
      //It will automatically fallback to http
    }
 }
 loadModule(name){
    this[name] = require(name);
  }
  getClientKey(url){
    return `${url.protocol}${url.servername || url.host}:${url.port}`;
  }
  getHttp2Client(clientKey){
    return this.http2Clients[clientKey];
  }
  setHttp2Client(clientKey , client){
    const httpManager = this;
    const prevClient = httpManager.http2Clients[clientKey];
    if (prevClient)
      httpManager.removeHttp2Client(clientKey , prevClient);
    httpManager.http2Clients[clientKey] = client;

    function closeClient(){
      httpManager.removeHttp2Client(clientKey , client);
    }
    client.on('close' , closeClient)
    client.on('error' , closeClient)
    client.on('frameError' , closeClient)
    client.on('timeout' , closeClient);

  }
  removeHttp2Client(clientKey , client){
    try{
      delete this.http2Clients[clientKey];
      if (!client.closed){
        client.close();
        client.unref()
      }
    }
    catch(err){
     
    }
    client.removeAllListeners('close');
    client.removeAllListeners('error');
    client.removeAllListeners('frameError');
    client.removeAllListeners('timeout');
  }
  request(){
    var requestOptions , cb,url , args;
    var isInternalGet = arguments[0] instanceof GetRequestInternal;
    if (isInternalGet){
      args = arguments[0].args;
    }
    else{
      args = arguments;
    }
    if (args.length >2){
      url = args[0];
      requestOptions = args[1];
      cb = args[2];
    }
    else{
      requestOptions = args[0];
      cb = args[1];
    }
    cb = cb || function dummy(){};
    requestOptions = requestOptions || {};

    if (typeof requestOptions === 'string') {
      requestOptions = urlToOptions(new URL(requestOptions));
      if (!requestOptions.hostname) {
        throw new Error('Unable to determine the domain name');
      }
    }
    else {
      if (url){
        requestOptions = _extend(urlToOptions(new URL(url)), requestOptions);
      }
      else{
        requestOptions = _extend({}, requestOptions);
      }
    }

    if (!requestOptions.protocol)
      requestOptions.protocol = 'http:';

    if (requestOptions.protocol == 'https:' && !requestOptions.port && requestOptions.port !=0)
      requestOptions.port = 443;
      
    if (!requestOptions.port && requestOptions.port !=0)
      requestOptions.port = 80;
      
    if (!requestOptions.method || isInternalGet)
      requestOptions.method = 'GET';

    requestOptions.method = requestOptions.method.toUpperCase();
      
    const inStream = new HTTP2OutgoingMessage();
    const clientKey = this.getClientKey(requestOptions);

    if (this.hasCachedConnection(clientKey))
      process.nextTick(function onMakeRequest(){
        this.makeRequest( inStream ,clientKey  , requestOptions, cb);
      }.bind(this)) 
    else 
      this.holdConnectionToIdentification(clientKey , requestOptions , function onIdentification(connectionOptions){
          this.makeRequest(inStream , clientKey , requestOptions, cb , connectionOptions);
      }.bind(this));
    return inStream;
  }
  get(){
    var request = this.request(new GetRequestInternal(arguments));
    request.end();
    return request;
  }
  hasCachedConnection(clientKey){
    const http2Client = this.getHttp2Client(clientKey);  
    if (http2Client){
        return true;
    }
    return this.cachedHTTP1Result[clientKey] + this.keepH1IdentificationCacheFor < Date.now();
  }
  makeRequest(inStream , clientKey  , requestOptions ,cb  , connectionOptions){
    const http2Client = this.getHttp2Client(clientKey);  
    if (http2Client){
        return this.makeHttp2Request(clientKey , inStream , http2Client ,requestOptions, cb);
    }
    //It's http1.1 let Node.JS core manage it
    requestOptions.agent = this.httpAgent;
    return this.makeHttpRequest(clientKey , inStream , requestOptions ,cb , connectionOptions);
  }
  holdConnectionToIdentification(clientKey , requestOptions  , cb){
    const topic = `identify-${clientKey}`;
    //If there are any pending identification process let's wait for one to finish
    if (this._events[topic])
      this.once(topic , cb); //There is.. let's wait
    else{
      //We will need to start identification
      this.once(topic , function letKnowThereIsAnEvent(){}); //There is.. let's wait
      const socket = this.identifyConnection(requestOptions , function onIdentify(type){
        var options = {
          createConnection(){
            return socket;
          }
        }
        if ( type == 'h2' && this.http2Support){
          var http2Client  = this.http2.connect(requestOptions ,options);
          this.setHttp2Client(clientKey , http2Client);
        }
        else{
          //This is http1.1
          //Cache last result time
          this.cachedHTTP1Result[clientKey] = Date.now();
          //Continue let core handle http1.1
        }
        cb(options);
        this.emit(topic);
      }.bind(this))
    }
    
  }
  makeHttpRequest(clientKey , inStream , options , cb , connectionOptions){
    if (options instanceof URL)
      options = urlToOptions(options);

    const h1op = _extend({} , options);
    if (connectionOptions)
      h1op.createConnection = connectionOptions.createConnection;

    const requestModule = h1op.protocol == 'https:' ? this.https : this.http;
    const req = requestModule.request(h1op ,cb);
 
    inStream.take(req);
  }
  makeHttp2Request(clientKey , inStream , http2Client , requestOptions , cb){
      var http2Debouncer = this.http2Debouncer;
      http2Debouncer.pause(clientKey);
      var headers =  _extend({} , requestOptions.headers || {});
      if (requestOptions.method)
        headers[':method'] = requestOptions.method; 
      if (requestOptions.path)
        headers[':path'] = requestOptions.path;

      delete headers.host;
      delete headers.connection;
      requestOptions.headers = headers;
      var req =  http2Client.request(
        headers
      );
      inStream.emit('socket' , requestOptions /*.createConnection()*/);

      let maxContentLength;
      let currentContent = 0;
 
      req.on('data' , function onData(data){
        currentContent+=data.length;
        if (currentContent>= maxContentLength)
          http2Debouncer.unpauseAndTime(clientKey);
      })
      inStream.take(req);
      function onResponse(headers){
        maxContentLength = parseInt(headers['content-length']);
        if (maxContentLength < 0 )
          this.http2Debouncer.unpauseAndTime(clientKey);

        HttpRequestManager.httpCompatibleResponse(req , requestOptions , headers);
        inStream.emit('http1.response' , req);
        if (cb)
          cb(req);
      }
      onResponse.http2Safe = true;
      req.once('response' , onResponse.bind(this));
  }
  static httpCompatibleResponse(res , requestOptions , headers){
    res.httpVersion = '2.0';
    res.rawHeaders = headers;
    res.headers = headers;
    res.statusCode = headers[':status'];
    delete headers[':status'];
  }
  identifyConnection(requestOptions , cb){
    var sokcet = this.connect( requestOptions , function onConnect(){
      cb(sokcet.alpnProtocol == 'h2' ? 'h2' : 'h1');
    });
    return sokcet;
  }
  connect(authority, options, listener) {
    if (typeof options === 'function') {
      listener = options;
      options = undefined;
    }
  
    assertIsObject(options, 'options');
    options = Object.assign({}, options);
  
    if (typeof authority === 'string')
      authority = new URL(authority);
  
    assertIsObject(authority, 'authority', ['string', 'Object', 'URL']);
  
    var protocol = authority.protocol || options.protocol || 'https:';
    var port = '' + (authority.port !== '' ?
      authority.port : (authority.protocol === 'http:' ? 80 : 443));
    var host = authority.hostname || authority.host || 'localhost';
  
    var socket;
    if (typeof options.createConnection === 'function') {
      socket = options.createConnection(authority, options);
    } else {
      switch (protocol) {
        case 'http:':
           socket = this.net.connect(port, host , listener);
          break;
        case 'https:':
           socket = this.tls.connect(port, host, initializeTLSOptions.call(this , options, host) , listener);
          break;
        default:
          throw new Error('Not supprted' + protocol);
      }
    }
    return socket;
  }
}
function urlToOptions(url) {
  var options = {
    protocol: url.protocol,
    hostname: url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname}${url.search}`,
    href: url.href
  };
  if (url.port !== '') {
    options.port = Number(url.port);
  }
  if (url.username || url.password) {
    options.auth = `${url.username}:${url.password}`;
  }
  return options;
}
class GetRequestInternal{
  constructor(args){
    this.args = args;
  }
}
module.exports = {
    HTTP2OutgoingMessage,
    HttpRequestManager
}