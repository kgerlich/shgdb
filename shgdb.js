const gdbmi_class = require('./gdbmi').gdbmi;
const { spawn } = require('child_process');
const babel = require('babel-polyfill');
const blessed = require('neo-blessed');

function format(fmt, ...args) {
    if (!fmt.match(/^(?:(?:(?:[^{}]|(?:\{\{)|(?:\}\}))+)|(?:\{[0-9]+\}))+$/)) {
        throw new Error('invalid format string.');
    }
    return fmt.replace(/((?:[^{}]|(?:\{\{)|(?:\}\}))+)|(?:\{([0-9]+)\})/g, (m, str, index) => {
        if (str) {
            return str.replace(/(?:{{)|(?:}})/g, m => m[0]);
        } else {
            if (index >= args.length) {
                throw new Error('argument index is out of range in format');
            }
            return args[index];
        }
    });
}

function decodeUtf8(arrayBuffer) {
    var result = "";
    var i = 0;
    var c = 0;
    var c1 = 0;
    var c2 = 0;

    var data = new Uint8Array(arrayBuffer);

    // If we have a BOM skip it
    if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
        i = 3;
    }

    while (i < data.length) {
        c = data[i];

        if (c < 128) {
        result += String.fromCharCode(c);
        i++;
        } else if (c > 191 && c < 224) {
        if( i+1 >= data.length ) {
            throw "UTF-8 Decode failed. Two byte character was truncated.";
        }
        c2 = data[i+1];
        result += String.fromCharCode( ((c&31)<<6) | (c2&63) );
        i += 2;
        } else {
        if (i+2 >= data.length) {
            throw "UTF-8 Decode failed. Multi byte character was truncated.";
        }
        c2 = data[i+1];
        c3 = data[i+2];
        result += String.fromCharCode( ((c&15)<<12) | ((c2&63)<<6) | (c3&63) );
        i += 3;
        }
    }
    return result;
}

// Create a screen object.
var screen = blessed.screen({
  smartCSR: true,
  dockBorders: true
});

screen.title = 'GDB shell with node-js and gdb-js';

screen.key('C-q', function() {
    process.exit(0);
});

screen.on('resize', function() {
    mylog('resize');
});

// Create a box perfectly centered horizontally and vertically.
var source = blessed.box({
    top: 'top',
    left: 'left',
    width: '70%',
    height: '75%',
    content: '',
    tags: true,
    border: {
        type: 'line',
    },
    style: {
      fg: 'white',
      border: {
        fg: '#f0f0f0'
      },
    },
    alwaysScroll:true,
    keys:true,
    mouse:true,
    scrollable: true,
    scrollbar: {
      style: {
        bg: 'blue'
      }
    }
  });

var title = blessed.text({
    top: 0,
    left: 3,
    width: '70%-5',
    height: 1,
    content: 'test',
    style: {
      fg: 'black',
      bg: 'white',
    },
  });

var vars = blessed.box({
    top: 'top',
    right: '0',
    width: '30%',
    height: '25%',
    content: '',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: '#f0f0f0'
      },
    },
    alwaysScroll:true,
    keys:true,
    mouse:true,
    scrollable: true,
    scrollbar: {
      style: {
        bg: 'blue'
      }
    }
});

var backtrace = blessed.box({
    top: '25%',
    right: '0',
    width: '30%',
    height: '10%',
    content: '',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: '#f0f0f0'
      },
    },
    alwaysScroll:true,
    keys:true,
    mouse:true,
    scrollable: true,
    scrollbar: {
      style: {
        bg: 'blue'
      }
    }
});

var breakpoints = blessed.box({
    top: '35%',
    right: '0',
    width: '30%',
    height: '10%',
    content: '',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: '#f0f0f0'
      },
    },
    alwaysScroll:true,
    keys:true,
    mouse:true,
    scrollable: true,
    scrollbar: {
      style: {
        bg: 'blue'
      }
    }
});


var status = blessed.box({
    top: '50%',
    right: '0',
    width: '30%',
    height: '25%',
    content: '',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: '#f0f0f0'
      },
    },
    alwaysScroll:true,
    keys:true,
    mouse:true,
    scrollable: true,
    scrollbar: {
      style: {
        bg: 'blue'
      }
    }
});

var cmd = blessed.box({
    bottom: 2,
    left: 'left',
    width: '100%',
    height: '25%-2',
    content: '',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: '#A0A0A0 '
      },
    },
    keys:true,
    mouse:true,
    alwaysScroll:true,
    scrollable: true,
    scrollbar: {
      style: {
        bg: 'blue'
      }
    }
});

var input = blessed.textbox({
    bottom: 1,
    left: 0,
    height: 1,
    width: '100%',
    content: '',
    tags: true,
    style: {
      fg: 'white',
      bg: 'blue',
    },
    keys:true,
    mouse:true,
    inputOnFocus: true
});

var statusbar = blessed.textbox({
    bottom: 0,
    left: 0,
    height: 1,
    width: '100%',
    content: 'status',
    tags: true,
    style: {
      fg: 'white',
      bg: 'black',
    },
});

// Append our box to the screen.
screen.append(source);
screen.append(title);
screen.append(vars);
screen.append(backtrace);
screen.append(breakpoints);
screen.append(status);
screen.append(cmd);
screen.append(input);
screen.append(statusbar);
input.hide();

var last_submit = '';
var submit_history = [];
var submit_hist_idx = -1;
var breakpoint_list = [];
var last_stopped_data = undefined;

// when command line is submitted with Enter...
input.on('submit', function(data) {
     // replay last command when hit enter
     if (data == '' && last_submit!= '') {
         data = last_submit;
     }
     if (data.length > 1 && data[0] == '-') {
        gdbmi.cmdMI(data).then(
            function(result) {
                mylogcmd(JSON.stringify(result));
                last_submit = data;
                submit_history.push(data);
                submit_hist_idx = submit_history.length - 1;
            },
            function(error) {
                mylogcmd(error);
            },
        )
     }
     else {
        gdbmi.cmd(data).then(
            function(result) {
                mylogcmd(result);
                last_submit = data;
                submit_history.push(data);
                submit_hist_idx = submit_history.length - 1;
            },
            function(error) {
                mylogcmd(error);
            }
        )
    }
    // reset command line
    input.clearValue();
    input.focus();
});

// quit on CTRL-q in command line
input.key('C-q', function() {
    process.exit(0);
});

// handle special keys
input.on('keypress', function(ch, key) {
    switch (key.name) {
        case 'up':
            if (submit_history.length == 0)
                return;
            submit_hist_idx--;
            if (submit_hist_idx < 0)
                submit_hist_idx += submit_history.length
            submit_hist_idx = submit_hist_idx % submit_history.length;
            input.setValue(submit_history[submit_hist_idx]);
            screen.render();
            break;
        case 'down':
            if (submit_history.length == 0)
                return;
            submit_hist_idx ++;
            submit_hist_idx = submit_hist_idx % submit_history.length;
            input.setValue(submit_history[submit_hist_idx]);
            screen.render();
            break;
        case 'f5':
            input.emit('submit', 'continue');
            break;
        case 'f9':
            input.emit('submit', 'b ');
            break;
        case 'f10':
            input.emit('submit', 'next');
            break;
        case 'f11':
            input.emit('submit', 'si');
    }
});

function mylog(msg) {
    status.pushLine(msg);
    status.setScrollPerc(100);
    screen.render();
}

function mylogcmd(msg) {
    cmd.pushLine(msg);
    cmd.setScrollPerc(100);
    screen.render();
}

if (process.argv.length != 3) {
    console.log('specify a target!');
    process.exit(1)
}

//let child = spawn('/home/kgerlicher/p4/sw/tools/embedded/qnx/qnx700-ga1/host/linux/x86_64/usr/bin/ntox86_64-gdb', ['--interpreter=mi2', process.argv[2]])
let child = spawn('gdb', ['--interpreter=mi2', process.argv[2]])
child.on('exit', function (code, signal) {
    mylog('child process exited with ' +
                `code ${code} and signal ${signal}`);

    process.exit(1);
});


child.stdout.on('data', function(data) {
    //let s = decodeUtf8(data.buffer);
    //mylog(s);
});

child.stderr.on('data', function(data) {
    //let s = decodeUtf8(data.buffer);
    //mylog(data);
});

var gdbmi = new gdbmi_class(child)

// setup CTRL-c handler
screen.key(['C-c'], function(ch, key) {
    mylog('CTRL-c');
    child.kill('SIGINT');
    input.show();
    input.focus();
    mylog('CTRL-c exit');
 });

// listen general status
gdbmi.on('status', function(data) {
    mylog('status ' + data);
});

// listen to notiications
gdbmi.on('notify', function(data) {
    mylog('notify ' + data.class);
    switch(data.class) {
        case 'breakpoint-created':
        case 'breakpoint-modified':
            mylogcmd(JSON.stringify(data.bkpt));
            breakpoint_list.push(data.bkpt);
            if (last_stopped_data) {
                get_info(last_stopped_data).then(
                    function() {
                        screen.render();
                    }
                )
            }
            break;
    }
});

function line_has_breakpoint(line, file)
{
    for (var i in breakpoint_list) {
        if (breakpoint_list[i].fullname == file && breakpoint_list[i].line == line) {
            return true;
        }
    }
    return false;
}

async function get_info(data) {
    let h = source.height;
    let cli = format("list {0}:{1}", data.frame.file, data.frame.line);
    await gdbmi.cmdMI('-stack-list-frames').then(
        function(result) {
            backtrace.setContent('');
            var s = result.stack;
            for (var i in s) {
                backtrace.setLine(i, format("{0} {1}:{2} {3}", s[i].level, s[i].func, s[i].line, s[i].file))
                if (s[i].level == 0) {
                    title.setText(s[i].fullname);
                }
            }
        }
    );
    await gdbmi.cmd(format('set listsize {0}',h-2));
    await gdbmi.cmd(cli).then(
        function(result) {
            result = result.split('\n');
            source.setContent('');
            for (var i in result) {
                let r = result[i].match(/([0-9]+)[\t]*(.*)/i);
                if (r && r.length > 2) {
                    let bg_color = '{white-bg}';
                    let bg_color_end = '{/white-bg}';
                    let bLineBp = line_has_breakpoint(r[1], data.frame.file);
                    if (bLineBp && (r[1] != data.frame.frame.line)) {
                        bg_color = '{blue-bg}';
                        bg_color_end = '{/blue-bg}';
                    }
                    if ((r[1] == data.frame.line) || bLineBp) {
                        source.setLine(i, '{black-fg}' + bg_color + '{bold}' + r[2] + '{/bold}' + bg_color_end + '{/black-fg}');
                    } else {
                        source.setLine(i, r[2]);
                    }
                } else {
                    mylog('malformed line');
                }
            }
        },
        function(result) {
            mylog(result);
        }
    )
    await gdbmi.cmd('info locals').then(
        function(result) {
            vars.setContent('');
            result = result.split('\n');
            for (i in result) {
                let  r = result[i].match(/(.*)\s*=\s*(.*)/i);
                if (!r)
                    continue;
                let r1 = r[1];
                gdbmi.cmd(format('ptype {0}', r1)).then(
                    function(result) {
                        let r2 = result.match(/type\s*=\s*(.*)/i);
                        if (r2) {
                            vars.pushLine(format("{0} {1} {2}", r2[1], r[1], r[2]));
                        }
                    }
                ).then(
                    function(result) {
                        screen.render();
                    }
                )
            }
        }
    )
}

// called when debugee stopped
gdbmi.on('stopped', function(data) {
    mylog(data.reason);
    input.show();
    input.focus();
    statusbar.setText('stopped');
    if (data.reason == 'signal-received') {
        mylog(data.reason);
    }
    if (data.reason == 'breakpoint-hit' ||
        data.reason == 'end-stepping-range' ||
        data.reason == 'signal-received' ||
        data.reason == 'function-finished') {
        last_stopped_data = data;
        get_info(data).then(
            function() {
                screen.render();
            }
        )

    }
});

gdbmi.on('running', function(data) {
    input.hide();
    statusbar.setText('running');
    screen.render();
});

async function start() {
    await gdbmi.cmd('info sharedlibrary').then(
        function(result) {
            mylog(result);
        },
        function(result) {
            mylog(result);
        }
    );
    await gdbmi.cmd('show non-stop').then(
        function(result) {
            mylog(result);
        },
        function(result) {
            mylog(result);
        }
    );
    await gdbmi.cmd('set non-stop on').then(
        function(result) {
            mylog(result);
        },
        function(result) {
            mylog(result);
        }
    );
    await gdbmi.cmd('b main').then(
        function(result) {
            mylog(result);
        },
        function(result) {
            mylog(result);
        }
    );
    await gdbmi.cmd('run');
    await screen.render();
}

start();