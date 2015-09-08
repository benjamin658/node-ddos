var Hash = require('hashish');
var response = require('response');
var config = require(__dirname + '/config');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var transporter = nodemailer.createTransport(smtpTransport({
    service: config.service,
    auth: {
        user: config.username,
        pass: config.password
    }
}));
var ddos = function (params) {
    // burst, maxexpiry, checkinterval is in seconds
    // limit is the maximum count
    var _params = {};
    _params.maxcount = 30;
    _params.burst = 5;
    _params.limit = _params.burst * 4;
    _params.maxexpiry = 120;
    _params.checkinterval = 1;
    _params.errormessage = 'Error';
    _params.testmode = false;
    if (!params) {
        params = _params;
    } else {
        if ((params.burst !== undefined) && (params.limit === undefined)) {
            params.limit = params.burst * 4;
        }
        if (params.limit != undefined) {
            params.maxcount = params.limit * 2;
        }
        Hash(_params).update(params);
        params = _params
    }
    console.log("ddos: starting params: ", params);
    var table = {};
    var update = function () {
        //console.log("ddos: update", table)
        var keys = Object.keys(table);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            table[key].expiry -= params.checkinterval;
            if (table[key].expiry <= 0)
                delete table[key]
        }
    };
    var alertCheck = function (host) {
        if (table[host].alert) {
            return false;
        }
        var mailOptions = {
            from: config.from,
            to: config.to,
            subject: 'DDos Alert',
            html: '<h1>' + host + '</h1>'
        };
        transporter.sendMail(mailOptions);
        table[host].alert = true;
    };
    var timer = setInterval(update, params.checkinterval * 1000);
    this.stop = function () {
        if (timer) {
            //console.log("ddos: stopping", timer)
            clearInterval(timer)
        }
    };
    var handle = function (req, res, next) {
        if (params.testmode) {
            console.log('ddos: handle: beginning:', table)
        }
        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        var host = ip + "#" + req.headers['user-agent'];
        if (!table[host])
            table[host] = {count: 1, expiry: 1, alert: false};
        else {
            table[host].count++;
            if (table[host].count > params.maxcount)
                table[host].count = params.maxcount;
            if (table[host].count > params.burst) {
                if (table[host].expiry < params.maxexpiry)
                    table[host].expiry = Math.min(params.maxexpiry, table[host].expiry * 2);
            } else {
                table[host].expiry = 1;
            }
        }
        if (table[host].count > params.limit) {
            console.log('ddos: denied: entry:', host, table[host]);
            if (params.testmode) {
                alertCheck(host);
                response.json(table[host]).status(500).pipe(res);
            } else {
                alertCheck(host);
                res.writeHead(500);
                res.end(params.errormessage);
            }
        } else {
            next();
        }
        if (params.testmode) {
            console.log('ddos: handle: end:', table);
        }
    };
    this.express = handle;
    this.middleware = handle;
    this.params = params;
    this.table = table;
};
module.exports = exports = ddos;
