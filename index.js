(function (win) {

    if(!document.getElementById('cross-request-sign')){
        return;
    }

    /*==============common begin=================*/

    var container = 'y-request';
    var INITSTATUS = 0;
    var RUNSTATUS = 1;
    var ENDSTATUS = 2;

    var base64 = _base64();
    function encode(data) {
        return base64.encode(encodeURIComponent(JSON.stringify(data)));
    }

    function decode(data) {
        return JSON.parse(decodeURIComponent(base64.decode(data)));
    }

    function _base64() {

        /*--------------------------------------------------------------------------*/

        var InvalidCharacterError = function (message) {
            this.message = message;
        };
        InvalidCharacterError.prototype = new Error;
        InvalidCharacterError.prototype.name = 'InvalidCharacterError';

        var error = function (message) {
            // Note: the error messages used throughout this file match those used by
            // the native `atob`/`btoa` implementation in Chromium.
            throw new InvalidCharacterError(message);
        };

        var TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        // http://whatwg.org/html/common-microsyntaxes.html#space-character
        var REGEX_SPACE_CHARACTERS = /\s/g;

        // `decode` is designed to be fully compatible with `atob` as described in the
        // HTML Standard. http://whatwg.org/html/webappapis.html#dom-windowbase64-atob
        // The optimized base64-decoding algorithm used is based on @atk’s excellent
        // implementation. https://gist.github.com/atk/1020396
        var decode = function (input) {
            input = String(input)
                .replace(REGEX_SPACE_CHARACTERS, '');
            var length = input.length;
            if (length % 4 == 0) {
                input = input.replace(/==?$/, '');
                length = input.length;
            }
            if (
                length % 4 == 1 ||
                // http://whatwg.org/C#alphanumeric-ascii-characters
                /[^+a-zA-Z0-9/]/.test(input)
            ) {
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
                // Unless this is the first of a group of 4 characters…
                if (bitCounter++ % 4) {
                    // …convert the first 8 bits to a single ASCII character.
                    output += String.fromCharCode(
                        0xFF & bitStorage >> (-2 * bitCounter & 6)
                    );
                }
            }
            return output;
        };

        // `encode` is designed to be fully compatible with `btoa` as described in the
        // HTML Standard: http://whatwg.org/html/webappapis.html#dom-windowbase64-btoa
        var encode = function (input) {
            input = String(input);
            if (/[^\0-\xFF]/.test(input)) {
                // Note: no need to special-case astral symbols here, as surrogates are
                // matched, and the input is supposed to only contain ASCII anyway.
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
            var d;
            var buffer;
            // Make sure any padding is handled outside of the loop.
            var length = input.length - padding;

            while (++position < length) {
                // Read three bytes, i.e. 24 bits.
                a = input.charCodeAt(position) << 16;
                b = input.charCodeAt(++position) << 8;
                c = input.charCodeAt(++position);
                buffer = a + b + c;
                // Turn the 24 bits into four chunks of 6 bits each, and append the
                // matching character for each of them to the output.
                output += (
                    TABLE.charAt(buffer >> 18 & 0x3F) +
                    TABLE.charAt(buffer >> 12 & 0x3F) +
                    TABLE.charAt(buffer >> 6 & 0x3F) +
                    TABLE.charAt(buffer & 0x3F)
                );
            }

            if (padding == 2) {
                a = input.charCodeAt(position) << 8;
                b = input.charCodeAt(++position);
                buffer = a + b;
                output += (
                    TABLE.charAt(buffer >> 10) +
                    TABLE.charAt((buffer >> 4) & 0x3F) +
                    TABLE.charAt((buffer << 2) & 0x3F) +
                    '='
                );
            } else if (padding == 1) {
                buffer = input.charCodeAt(position);
                output += (
                    TABLE.charAt(buffer >> 2) +
                    TABLE.charAt((buffer << 4) & 0x3F) +
                    '=='
                );
            }

            return output;
        };

        return {
            'encode': encode,
            'decode': decode,
            'version': '<%= version %>'
        };
    };

    var unsafeHeader = ['Accept-Charset',
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
        'Via'];
    /*==============common end=================*/

    function pickHeader(headers, name) {
        if (!headers || typeof headers !== 'object') return '';
        var target = String(name || '').toLowerCase();
        for (var key in headers) {
            if (!Object.prototype.hasOwnProperty.call(headers, key)) continue;
            if (String(key).toLowerCase() === target) return headers[key];
        }
        return '';
    }

    function toStructuredBody(body, headers) {
        if (typeof body !== 'string') return body;
        var text = body.trim();
        if (!text) return body;
        var contentType = String(pickHeader(headers, 'content-type') || '').toLowerCase();
        var maybeJson = contentType.indexOf('application/json') > -1 || contentType.indexOf('+json') > -1;
        if (!maybeJson && text[0] !== '{' && text[0] !== '[') {
            return body;
        }
        try {
            return JSON.parse(text);
        } catch (e) {
            return body;
        }
    }

    function createNode(tagName, attributes, parentNode) {
        options = attributes || {};
        tagName = tagName || 'div';
        var dom = document.createElement(tagName);
        for (var attr in attributes) {
            if (attr === 'id') dom.id = options[attr];
            else dom.setAttribute(attr, options[attr]);
        }
        if (parentNode) parentNode.appendChild(dom);
        return dom;
    }

    function getid() {
        return container + '-' + id++;
    }


    var yRequestDom = createNode('div', { id: container, style: 'display:none' }, document.getElementsByTagName('body')[0]);
    var yRequestMap = {};
    var id = 0;
    var interval;
    var debugPanel;
    var debugList;
    var debugModal;
    var debugModalBody;
    var debugBootstrapped = false;
    var MAX_DEBUG_ITEMS = 20;

    function ensureDebugPanel() {
        if (debugBootstrapped) return;
        debugBootstrapped = true;

        var style = createNode('style', {}, document.head || document.documentElement);
        style.innerText = ''
            + '#cross-request-debug{position:fixed;right:12px;bottom:12px;width:420px;max-height:60vh;z-index:2147483647;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,.35);font-size:12px;font-family:Consolas,Menlo,monospace;overflow:hidden;}'
            + '#cross-request-debug .cr-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#1f2937;border-bottom:1px solid #374151;}'
            + '#cross-request-debug .cr-title{font-weight:600;color:#93c5fd;}'
            + '#cross-request-debug .cr-btns button{margin-left:6px;background:#374151;color:#e5e7eb;border:0;border-radius:4px;padding:3px 7px;cursor:pointer;}'
            + '#cross-request-debug .cr-list{max-height:calc(60vh - 40px);overflow:auto;padding:8px;}'
            + '#cross-request-debug .cr-item{border:1px solid #374151;border-radius:6px;padding:8px;margin-bottom:8px;background:#0b1220;}'
            + '#cross-request-debug .cr-meta{display:flex;justify-content:space-between;margin-bottom:6px;color:#93c5fd;}'
            + '#cross-request-debug .cr-url{word-break:break-all;color:#d1d5db;}'
            + '#cross-request-debug .cr-row{display:flex;justify-content:space-between;align-items:center;gap:8px;}'
            + '#cross-request-debug .cr-row button{background:#1d4ed8;color:#fff;border:0;border-radius:4px;padding:3px 8px;cursor:pointer;}'
            + '#cross-request-debug .cr-pre{margin-top:6px;white-space:pre-wrap;word-break:break-word;color:#9ca3af;max-height:180px;overflow:auto;}'
            + '#cross-request-debug .ok{color:#34d399;}'
            + '#cross-request-debug .bad{color:#fca5a5;}'
            + '#cross-request-debug-modal{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:2147483647;display:none;}'
            + '#cross-request-debug-modal .cr-modal-inner{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1200px,92vw);height:min(84vh,900px);background:#0b1220;border:1px solid #374151;border-radius:10px;display:flex;flex-direction:column;}'
            + '#cross-request-debug-modal .cr-modal-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #374151;color:#93c5fd;}'
            + '#cross-request-debug-modal .cr-modal-btns button{margin-left:8px;background:#374151;color:#e5e7eb;border:0;border-radius:4px;padding:4px 9px;cursor:pointer;}'
            + '#cross-request-debug-modal .cr-modal-pre{flex:1;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:#e5e7eb;}';

        debugPanel = createNode('div', { id: 'cross-request-debug' }, document.body);
        var head = createNode('div', { class: 'cr-head' }, debugPanel);
        createNode('div', { class: 'cr-title' }, head).innerText = 'crossRequest logs';
        var btns = createNode('div', { class: 'cr-btns' }, head);
        var clearBtn = createNode('button', {}, btns);
        clearBtn.innerText = 'Clear';
        clearBtn.onclick = function () {
            debugList.innerHTML = '';
        };
        var hideBtn = createNode('button', {}, btns);
        hideBtn.innerText = 'Hide';
        hideBtn.onclick = function () {
            debugPanel.style.display = 'none';
        };
        debugList = createNode('div', { class: 'cr-list' }, debugPanel);

        debugModal = createNode('div', { id: 'cross-request-debug-modal' }, document.body);
        var modalInner = createNode('div', { class: 'cr-modal-inner' }, debugModal);
        var modalHead = createNode('div', { class: 'cr-modal-head' }, modalInner);
        createNode('span', {}, modalHead).innerText = 'Request response (expanded)';
        var modalBtns = createNode('div', { class: 'cr-modal-btns' }, modalHead);
        var copyBtn = createNode('button', {}, modalBtns);
        copyBtn.innerText = 'Copy';
        copyBtn.onclick = function () {
            if (!debugModalBody) return;
            var text = debugModalBody.innerText || '';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(function () { });
            }
        };
        var closeBtn = createNode('button', {}, modalBtns);
        closeBtn.innerText = 'Close';
        closeBtn.onclick = function () {
            debugModal.style.display = 'none';
        };
        debugModalBody = createNode('pre', { class: 'cr-modal-pre' }, modalInner);
        debugModal.onclick = function (e) {
            if (e.target === debugModal) {
                debugModal.style.display = 'none';
            }
        };

        document.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
                debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
            }
            if (e.key === 'Escape' && debugModal && debugModal.style.display !== 'none') {
                debugModal.style.display = 'none';
            }
        });
    }

    function appendDebugLog(info) {
        ensureDebugPanel();
        if (!debugList) return;

        var item = createNode('div', { class: 'cr-item' }, debugList);
        var row = createNode('div', { class: 'cr-row' }, item);
        var meta = createNode('div', { class: 'cr-meta' }, row);
        var status = createNode('span', { class: info.ok ? 'ok' : 'bad' }, meta);
        status.innerText = info.method + ' ' + info.status + ' (' + info.time + 'ms)';
        createNode('span', {}, meta).innerText = new Date().toLocaleTimeString();
        var expandBtn = createNode('button', {}, row);
        expandBtn.innerText = 'Expand';
        expandBtn.onclick = function () {
            ensureDebugPanel();
            if (!debugModal || !debugModalBody) return;
            debugModalBody.innerText = info.body || '';
            debugModal.style.display = 'block';
        };
        createNode('div', { class: 'cr-url' }, item).innerText = info.url || '';
        var pre = createNode('pre', { class: 'cr-pre' }, item);
        pre.innerText = info.body;

        while (debugList.childNodes.length > MAX_DEBUG_ITEMS) {
            debugList.removeChild(debugList.lastChild);
        }
    }


    function run(req) {
        if (!req) return;
        if (typeof req === 'string') req = { url: req }

        data = {
            res: null,
            req: req
        }
        data = encode(data);
        var newId = getid();
        var div = createNode('div', {
            _id: newId,
            status: INITSTATUS
        }, yRequestDom);
        div.innerText = data;
        yRequestMap[newId] = {
            id: newId,
            status: INITSTATUS,
            success: function (res, header, data) {
                if (typeof req.success === 'function') {
                    req.success(res, header, data);
                }
            },
            error: function (error, header, data) {
                if (typeof req.error === 'function') {
                    req.error(error, header, data)
                }
            }
        }
        monitor();
    }



    function monitor() {
        if (interval) return;
        interval = setInterval(function () {
            var queueDom = yRequestDom.childNodes;
            if (!queueDom || queueDom.length === 0) {
                interval = clearInterval(interval);
            }

            try {
                for (var i = 0; i < queueDom.length; i++) {
                    try {
                        var dom = queueDom[i];
                        if (+dom.getAttribute('status') === ENDSTATUS) {
                            var text = dom.innerText;
                            if (text) {
                                var data = decode(dom.innerText);
                                var id = dom.getAttribute('_id');
                                var res = data.res;
                                if (res.status === 200) {
                                    appendDebugLog({
                                        ok: true,
                                        method: (data.req.method || 'GET').toUpperCase(),
                                        status: res.status,
                                        time: data.runTime || 0,
                                        url: data.req.url,
                                        body: typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2)
                                    });
                                    yRequestMap[id].success(toStructuredBody(res.body, res.header), res.header, data);
                                } else {
                                    appendDebugLog({
                                        ok: false,
                                        method: (data.req.method || 'GET').toUpperCase(),
                                        status: res.status || 0,
                                        time: data.runTime || 0,
                                        url: data.req.url,
                                        body: typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2)
                                    });
                                    yRequestMap[id].error(res.body || res.statusText, res.header, data);
                                }
                                dom.parentNode.removeChild(dom);
                            } else {
                                dom.parentNode.removeChild(dom);
                            }

                        }
                    } catch (err) {
                        console.error(err.message);
                        dom.parentNode.removeChild(dom);
                    }
                }
            } catch (err) {
                console.error(err.message);
                interval = clearInterval(interval);
            }


        }, 50)
    }

    win.crossRequest = run;
    if (typeof define == 'function' && define.amd) {
        define('crossRequest', [], function () {
            return run;
        });
    }

})(window)

