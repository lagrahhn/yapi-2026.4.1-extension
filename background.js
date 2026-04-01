'use strict';

var base64 = _base64();

function formUrlencode(data) {
  if (data && typeof data === 'object') {
    return Object.keys(data)
      .map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
      })
      .join('&');
  }
  return '';
}

function encode(data) {
  return base64.encode(encodeURIComponent(JSON.stringify(data)));
}

function decode(data) {
  return JSON.parse(decodeURIComponent(base64.decode(data)));
}

function _base64() {
  var InvalidCharacterError = function (message) {
    this.message = message;
  };
  InvalidCharacterError.prototype = new Error();
  InvalidCharacterError.prototype.name = 'InvalidCharacterError';

  var error = function (message) {
    throw new InvalidCharacterError(message);
  };

  var TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var REGEX_SPACE_CHARACTERS = /\s/g;

  var decode = function (input) {
    input = String(input).replace(REGEX_SPACE_CHARACTERS, '');
    var length = input.length;
    if (length % 4 == 0) {
      input = input.replace(/==?$/, '');
      length = input.length;
    }
    if (length % 4 == 1 || /[^+a-zA-Z0-9/]/.test(input)) {
      error(
        'Invalid character: the string to be decoded is not correctly encoded.'
      );
    }
    var bitCounter = 0;
    var bitStorage;
    var buffer;
    var output = '';
    var position = -1;
    while (++position < length) {
      buffer = TABLE.indexOf(input.charAt(position));
      bitStorage = bitCounter % 4 ? bitStorage * 64 + buffer : buffer;
      if (bitCounter++ % 4) {
        output += String.fromCharCode(
          0xff & (bitStorage >> ((-2 * bitCounter) & 6))
        );
      }
    }
    return output;
  };

  var encode = function (input) {
    input = String(input);
    if (/[^\0-\xff]/.test(input)) {
      error(
        'The string to be encoded contains characters outside of the ' +
          'Latin1 range.'
      );
    }
    var padding = input.length % 3;
    var output = '';
    var position = -1;
    var a;
    var b;
    var c;
    var buffer;
    var length = input.length - padding;

    while (++position < length) {
      a = input.charCodeAt(position) << 16;
      b = input.charCodeAt(++position) << 8;
      c = input.charCodeAt(++position);
      buffer = a + b + c;
      output +=
        TABLE.charAt((buffer >> 18) & 0x3f) +
        TABLE.charAt((buffer >> 12) & 0x3f) +
        TABLE.charAt((buffer >> 6) & 0x3f) +
        TABLE.charAt(buffer & 0x3f);
    }

    if (padding == 2) {
      a = input.charCodeAt(position) << 8;
      b = input.charCodeAt(++position);
      buffer = a + b;
      output +=
        TABLE.charAt(buffer >> 10) +
        TABLE.charAt((buffer >> 4) & 0x3f) +
        TABLE.charAt((buffer << 2) & 0x3f) +
        '=';
    } else if (padding == 1) {
      buffer = input.charCodeAt(position);
      output +=
        TABLE.charAt(buffer >> 2) +
        TABLE.charAt((buffer << 4) & 0x3f) +
        '==';
    }

    return output;
  };

  return {
    encode: encode,
    decode: decode
  };
}

var unsafeHeader = [
  'Accept-Charset',
  'Accept-Encoding',
  'Access-Control-Request-Headers',
  'Access-Control-Request-Method',
  'Connection',
  'Content-Length',
  'Cookie',
  'Cookie2',
  'Content-Transfer-Encoding',
  'Date',
  'Expect',
  'Host',
  'Keep-Alive',
  'Origin',
  'Referer',
  'TE',
  'Trailer',
  'Transfer-Encoding',
  'Upgrade',
  'User-Agent',
  'Via'
];

var TAB_ID_NONE = -1;

var seqToRequestId = new Map();
var capturedResponseHeaders = new Map();

function headerNameKey(name) {
  return String(name || '').toLowerCase();
}

function getHeaderFromArray(headers, want) {
  if (!headers) return null;
  var w = headerNameKey(want);
  for (var i = 0; i < headers.length; i++) {
    if (headerNameKey(headers[i].name) === w) return headers[i].value;
  }
  return null;
}

function buildExposedResponseHeaders(responseHeadersArray) {
  var unsafeHeaderArr = { cookie: [] };
  var cookie = unsafeHeaderArr.cookie;
  if (!responseHeadersArray) {
    return decode(encode(unsafeHeaderArr));
  }
  responseHeadersArray.forEach(function (item) {
    if (headerNameKey(item.name) === 'set-cookie') {
      cookie.push(item.value);
    } else {
      unsafeHeaderArr[item.name] = item.value;
    }
  });
  return decode(encode(unsafeHeaderArr));
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    var seq = getHeaderFromArray(details.requestHeaders, 'cross-request-seq');
    var sign = getHeaderFromArray(details.requestHeaders, 'cross-request-open-sign');
    if (seq && sign === '1') {
      seqToRequestId.set(seq, details.requestId);
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders']
);

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    capturedResponseHeaders.set(details.requestId, details.responseHeaders);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
);

var dnrRuleIdCounter = 1;

function allocSessionRuleId() {
  return dnrRuleIdCounter++ % 0x7fffffff || 1;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSessionRule(ruleId, seq, unsafeHeaderArr, reqUrl, reqMethod) {
  var requestHeaders = [];
  if (unsafeHeaderArr && unsafeHeaderArr.length) {
    unsafeHeaderArr.forEach(function (v) {
      requestHeaders.push({
        header: v.name,
        operation: 'set',
        value: String(v.value)
      });
    });
  }
  requestHeaders.push(
    { header: 'cross-request-open-sign', operation: 'remove' },
    { header: 'cross-request-unsafe-headers-list', operation: 'remove' },
    { header: 'cross-request-seq', operation: 'remove' }
  );

  var condition = {
    tabIds: [TAB_ID_NONE]
  };
  if (reqMethod) {
    condition.requestMethods = [String(reqMethod).toLowerCase()];
  }
  if (reqUrl) {
    condition.regexFilter = '^' + escapeRegExp(String(reqUrl)) + '$';
  } else {
    condition.urlFilter = '*';
  }

  return {
    id: ruleId,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: requestHeaders
    },
    condition: condition
  };
}

chrome.runtime.onMessage.addListener(function (request, _sender, sendResponse) {
  if (request.action === 'get') {
    chrome.storage.local.get([request.name]).then(function (obj) {
      var v = obj[request.name];
      sendResponse(v === undefined ? null : v);
    });
    return true;
  }
  if (request.action === 'set') {
    var o = {};
    o[request.name] = request.value;
    chrome.storage.local.set(o).then(function () {
      sendResponse(null);
    });
    return true;
  }
});

function sendAjax(req) {
  req.headers = req.headers || {};
  req.headers['Content-Type'] =
    req.headers['Content-Type'] ||
    req.headers['Content-type'] ||
    req.headers['content-type'];

  var timeout = req.timeout || 1000000;
  req.method = req.method || 'GET';
  req.async = req.async === false ? false : true;
  req.headers = req.headers || {};

  if (
    req.method.toLowerCase() !== 'get' &&
    req.method.toLowerCase() !== 'head' &&
    req.method.toLowerCase() !== 'options'
  ) {
    if (
      !req.headers['Content-Type'] ||
      req.headers['Content-Type'].startsWith('application/x-www-form-urlencoded')
    ) {
      req.headers['Content-Type'] =
        req.headers['Content-Type'] || 'application/x-www-form-urlencoded';
      req.data = formUrlencode(req.data);
    } else if (typeof req.data === 'object' && req.data) {
      if (typeof FormData !== 'undefined' && req.data instanceof FormData) {
        /* keep */
      } else if (
        typeof Blob !== 'undefined' &&
        req.data instanceof Blob
      ) {
        /* keep */
      } else if (req.data instanceof ArrayBuffer) {
        /* keep */
      } else {
        req.data = JSON.stringify(req.data);
      }
    }
  } else {
    delete req.headers['Content-Type'];
  }

  if (req.query && typeof req.query === 'object') {
    var getUrl = formUrlencode(req.query);
    req.url = req.url + '?' + getUrl;
    req.query = '';
  }

  var url = req.url;
  var method = req.method;
  var body =
    req.data === undefined || req.data === null ? undefined : req.data;

  var unsafeHeaderArr = [];
  var fetchHeaders = new Headers();
  if (req.headers) {
    for (var name in req.headers) {
      if (!Object.prototype.hasOwnProperty.call(req.headers, name)) continue;
      if (unsafeHeader.indexOf(name) > -1) {
        unsafeHeaderArr.push({ name: name, value: req.headers[name] });
      } else {
        fetchHeaders.set(name, req.headers[name]);
      }
    }
  }
  if (unsafeHeaderArr.length > 0) {
    fetchHeaders.set(
      'cross-request-unsafe-headers-list',
      encode(unsafeHeaderArr)
    );
  }
  fetchHeaders.set('cross-request-open-sign', '1');

  var seq = crypto.randomUUID();
  fetchHeaders.set('cross-request-seq', seq);

  var sessionRuleId = allocSessionRuleId();
  var rule = buildSessionRule(sessionRuleId, seq, unsafeHeaderArr, url, method);

  var controller = new AbortController();
  var timedOut = false;
  var timer = setTimeout(function () {
    timedOut = true;
    controller.abort();
  }, timeout);

  return (async function () {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [rule],
        removeRuleIds: []
      });

      var res = await fetch(url, {
        method: method,
        headers: fetchHeaders,
        body: body,
        cache: 'no-store',
        signal: controller.signal
      });

      var requestId = seqToRequestId.get(seq);
      var rawArr =
        requestId !== undefined
          ? capturedResponseHeaders.get(requestId)
          : null;
      var headers;
      if (rawArr != null) {
        headers = buildExposedResponseHeaders(rawArr);
      } else {
        headers = {};
        res.headers.forEach(function (value, key) {
          headers[key] = value;
        });
      }

      var text = await res.text();
      return {
        headers: headers,
        status: res.status,
        statusText: res.statusText,
        body: text
      };
    } catch (err) {
      var msg =
        err && err.name === 'AbortError' && timedOut
          ? 'Error:Request timeout that the time is ' + timeout
          : err && err.message
            ? err.message
            : String(err);
      return {
        headers: {},
        status: 0,
        statusText: '',
        body: msg
      };
    } finally {
      clearTimeout(timer);
      var rid = seqToRequestId.get(seq);
      seqToRequestId.delete(seq);
      if (rid !== undefined) {
        capturedResponseHeaders.delete(rid);
      }
      try {
        await chrome.declarativeNetRequest.updateSessionRules({
          addRules: [],
          removeRuleIds: [sessionRuleId]
        });
      } catch (e) {
        /* ignore */
      }
    }
  })();
}

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'request') return;
  port.onMessage.addListener(function (msg) {
    sendAjax(msg.req).then(function (res) {
      port.postMessage({ id: msg.id, res: res });
      if (chrome.runtime.lastError) {
        void chrome.runtime.lastError.message;
      }
    });
  });
});
