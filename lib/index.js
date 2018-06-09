const {HttpRequestManager , HTTP2OutgoingMessage} = require('./request');

const singeltonHttpManager = new HttpRequestManager();
const request = singeltonHttpManager.request.bind(singeltonHttpManager);

module.exports = {
    HTTP2OutgoingMessage,
    HttpRequestManager,
    request
}