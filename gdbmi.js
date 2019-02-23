const EventEmitter = require('events').EventEmitter;
const { spawn } = require('child_process');
const gdbmiparse = require('gdb-mi-parser');

class gdbmi extends EventEmitter {

    constructor(child) {
        super();

        this.child = child;
        this.command_seq = 0;

        var _this = this

        child.stdout.on('data', function (data) {
            _this.emit('stdout', data);
            let p = gdbmiparse(data);
            _this.decode_output(p);
        });

        child.stderr.on('data', function (data) {
        });

        child.on('exit', function (code) {
            _this.emit('exit', code);
        });
    }

    decode_output(p) {
        let oobr =  p.outOfBandRecords;
        for (let i in oobr) {
            let o = oobr[i];

            switch(o.outputType) {
                case 'exec':
                    this.emit(o.class, o.result);
                    break;
                case 'console':
                    this.emit('console', o.result);
                    break;
            }
        }

        if (p.resultRecord) {
            switch(p.resultRecord.class) {
                case 'done':
                case 'error':
                    this.emit('done', p.resultRecord );
                    break;
            }
        }

    }

    cmd (command) {
        return new Promise((resolve, reject) => {
            let console_out = '';
            let seq = this.command_seq++;
            function _console(d) {
                console_out += d.replace(/[\n|\r][^$]/g,'\\n');
            }
            function _done(d) {
                if (parseInt(d.token) >= seq) {
                    this.removeListener('console', _console);
                    this.removeListener('done', _done);
                    resolve(console_out);
                }
            }
            this.on('console', _console);
            this.on('done', _done);
            this.child.stdin.write(String(seq) + `${command}\n`);
        });
    };

    cmdMI (command) {
        return new Promise((resolve, reject) => {
            let console_out = '';
            let seq = this.command_seq++;
            function _console(d) {
                console_out += d;
            }
            function _done(d) {
                if (parseInt(d.token) >= seq) {
                    this.removeListener('console', _console);
                    this.removeListener('done', _done);
                    resolve(d.result);
                }
            }
            this.on('console', _console);
            this.on('done', _done);
            this.child.stdin.write(String(seq) + `${command}\n`);
        });
    };
}

module.exports.gdbmi = gdbmi;