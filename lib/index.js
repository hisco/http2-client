const {HttpRequestManager , HTTP2OutgoingMessage} = require('./request');

const singeltonHttpManager = new HttpRequestManager();
const request = singeltonHttpManager.request.bind(singeltonHttpManager);
const get = singeltonHttpManager.get.bind(singeltonHttpManager);

module.exports = {
    HTTP2OutgoingMessage,
    HttpRequestManager,
    request,
    get
}