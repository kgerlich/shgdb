const gdbjs = require ('gdb-js');
const { spawn } = require('child_process');
const babel = require('babel-polyfill');
const blessed = require('blessed');

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

// Create a screen object.
var screen = blessed.screen({
  smartCSR: true,
  dockBorders: true
});

screen.title = 'GDB shell with node-js and gdb-js';

screen.key('q', function() {
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
screen.append(status);
screen.append(cmd);
screen.append(input);
screen.append(statusbar);
input.hide();

input.on('submit', function(data) {
     gdb.execCLI(data).then(
        function(result) {
            mylogcmd(result);
        },
        function(error) { 
            mylogcmd(error);
        },
    )
    input.clearValue();
    input.focus();
});


// Render the screen.
screen.render();

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

let child = spawn('gdb', ['--interpreter=mi2', '/home/kgerlicher/shgdb/testapp/testapp'])
child.on('exit', function (code, signal) {
    mylog('child process exited with ' +
                `code ${code} and signal ${signal}`);

    process.exit(1);
});

var gdb = new gdbjs.GDB(child)

// setup CTRL-c handler
screen.key(['C-c'], function(ch, key) {
    mylog('CTRL-c');
    child.kill('SIGINT');
    // gdb.interrupt().then(
    //     function(result) {
    //         mylog(result);
    //     }
    // ).catch(
    //     function(error) {
    //         mylog(error);
    //     }
    // );
    input.show();
    input.focus();
    mylog('CTRL-c exit');
 });

// listen general status
gdb.on('status', function(data) {
    mylog('status ' + data);
});

// listen to notiications
gdb.on('notify', function(data) {
    mylog('notify ' + data .state);
});

async function get_info(data) {
    let h = source.height;
    let cli = format("list {0}:{1}", data.thread.frame.file, data.thread.frame.line);

    await gdb.execCLI(format('set listsize {0}',h-2));
    await gdb.execCLI(cli).then(
        function(result) {
            result = result.split('\n');
            source.setContent('');
            for (var i in result) {
                let r = result[i].match(/([0-9]+)[\t]*(.*)/i);
                if (r && r.length > 2) {
                    if (r[1] == data.thread.frame.line) {
                        source.setLine(i, '{black-fg}{white-bg}{bold}' + r[2] + '{/bold}{/white-bg}{/black-fg}');
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
    await gdb.execCLI('info locals').then(
        function(result) {
            vars.setContent('');
            result = result.split('\n');
            for (i in result) {
                let  r = result[i].match(/(.*)\s*=\s*(.*)/i);
                if (!r)
                    continue;
                let r1 = r[1];
                gdb.execCLI(format('ptype {0}', r1)).then(
                    function(result) {
                        let r2 = result.match(/type\s*=\s*(.*)/i);
                        if (r2) {
                            vars.pushLine(format("{0} {1} {2}", r2[1], r[1], r[2]));
                        }
                    }
                )
                .then(
                    function(result) {
                        screen.render();
                    }
                )
            }
        }
    )
    await gdb.execMI('-stack-list-frames').then(
        function(result) {
            backtrace.setContent('');
            var s = result.stack;
            for (var i in s) {
                backtrace.setLine(i, format("{0} {1}:{2} {3}", s[i].value.level, s[i].value.func, s[i].value.line, s[i].value.file))
                if (s[i].value.level == 0) {
                    title.setText(s[i].value.fullname);
                }
            }
        }
    );
}
 
// called when debugee stopped
gdb.on('stopped', function(data) {
    mylog(data.reason);
    input.show();
    input.focus();
    statusbar.setText('stopped');
    if (data.reason == 'breakpoint-hit' || 
        data.reason == 'end-stepping-range' ||
        data.reason == 'signal-received') {

        get_info(data).then(
            function() {
                screen.render();
            }
        )

    } else if (data.reason == 'signal-received') {
        mylog();
    }
});

gdb.on('running', function(data) {
    input.hide();
    statusbar.setText('running');
    screen.render();
});

async function start() {
    await gdb.init();
    await gdb.execCLI('info sharedlibrary').then(
        function(result) {
            mylog(result);
        },
        function(result) {
            mylog(result);
        }
    );
    await gdb.execCLI('show non-stop').then(
        function(result) {
            mylog(result);
        },
        function(result) {
            mylog(result);
        }
    );
    await gdb.execCLI('set non-stop on').then(
        function(result) {
            mylog(result);
        },
        function(result) {
            mylog(result);
        }
    );
    await gdb.addBreak('testapp.c', 'main').then(
        function(result) {
            mylog(result);
        },
        function(result) {
            mylog(result);
        }
    );
    await gdb.run();
}

start();