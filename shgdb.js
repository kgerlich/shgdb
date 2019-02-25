const gdbmi_class = require('./gdbmi').gdbmi;
const { spawn } = require('child_process');
const babel = require('babel-polyfill');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const { serial, parallel } = require('items-promise');

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
    left: 0,
    width: '70%',
    height: '75%',
    content: '',
    tags: true,
    border: {
        type: 'line',
    },
    style: {
      fg: 'yellow',
      bg: '#001060',
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
    },
    label: ''
  });

var vars = contrib.table(
  { keys: true,
    mouse: true,
   fg: 'white',
   selectedFg: 'white',
   selectedBg: 'blue',
   interactive: true,
   label: 'Locals',
   left: '70%',
   top: 0,
   width: '30%',
   height: '25%',
   border: {type: "line", fg: "cyan"},
   columnSpacing: 5, //in chars
   columnWidth: [10, 10, 10] /*in chars*/
});

var backtrace = contrib.table(
  { keys: true,
    mouse: true,
   fg: 'white',
   selectedFg: 'white',
   selectedBg: 'blue',
   interactive: true,
   label: 'Backtrace',
   top: '25%',
   left: '70%',
   width: '30%',
   height: '10%',
   border: {type: "line", fg: "cyan"},
   columnSpacing: 5, //in chars
   columnWidth: [10, 10, 10, 10] /*in chars*/
});

var breakpoints = contrib.table(
  { keys: true,
    mouse: true,
   fg: 'white',
   selectedFg: 'white',
   selectedBg: 'blue',
   interactive: true,
   label: 'Backtrace',
   top: '35%',
   left: '70%',
   width: '30%',
   height: '10%',
   border: {type: "line", fg: "cyan"},
   columnSpacing: 5, //in chars
   columnWidth: [10, 10, 10, 10] /*in chars*/
 });

var status = contrib.log(
  {
    top: '50%',
    left: '70%',
    width: '30%',
    height: '25%',
    fg: "white",
    selectedFg: "green",
    label: 'Status',
    border: {type: "line", fg: "cyan"},
    keys:true,
    mouse:true,
    scrollable: true,
    scrollbar: {
      style: {
        bg: 'blue'
      }
    }
  })

var cmd = blessed.box({
    top: '75%',
    left: 0,
    width: '60%',
    height: '25%-1',
    content: '',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: '#A0A0A0 '
      }
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

var stdout = contrib.log(
  {
    top: '75%',
    left: '60%',
    width: '40%',
    height: '25%-1',
    fg: "white",
    selectedFg: "green",
    label: 'Status',
    border: {type: "line", fg: "cyan"},
    keys:true,
    mouse:true,
    scrollable: true,
    scrollbar: {
      style: {
        bg: 'blue'
      }
    }
  })

var prompt  = blessed.text({
    bottom: 1,
    left: 0,
    height: 1,
    width: '1',
    content: '>',
    style: {
      fg: 'white',
      bg: 'red',
    }
});

var input = blessed.textbox({
    bottom: 1,
    left: 1,
    height: 1,
    width: '50%-1',
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

var container = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
});

var source_container = blessed.box({
  top: 0,
  left: 0,
  width: '70%',
  height: '70%',
});
var info_container = blessed.box({
  width: '30%',
  height: '70%',
});

// Append our box to the container.
container.append(source);
container.append(vars);
container.append(backtrace);
container.append(breakpoints);
container.append(status);
container.append(cmd);
container.append(stdout);
container.append(prompt);
container.append(input);
container.append(statusbar);
screen.append(container);
input.focus();
screen.render();

var last_submit = '';
var submit_history = [];
var submit_hist_idx = -1;
var breakpoint_list = [];
var last_stopped_data = undefined;

// when command line is submitted with Enter...
input.on('submit', function(data) {
     input.hide();
     input.removeListener('keypress', _keypress);
     screen.render();

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
                // reset command line
                input.clearValue();
                input.focus();
                input.show();
                screen.render();
            }
        )
     }
     else {
        gdbmi.cmd(data).then(
            function(result) {
                mylogcmd(result);
                last_submit = data;
                submit_history.push(data);
                submit_hist_idx = submit_history.length - 1;
                // reset command line
                input.clearValue();
                input.focus();
                input.show();
                screen.render();
            }
        )
    }
});

// quit on CTRL-q in command line
input.key('C-q', function() {
    process.exit(0);
});

function _keypress(ch, key) {
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
}

// handle special keys
input.on('keypress', _keypress);

function mylog(msg) {
    if (!msg) {
      return;
    }
    status.log(msg.replace(/\n/g,''));
    screen.render();
}

function mylogcmd(msg) {
    if (!msg) {
      return;
    }
    cmd.pushLine(msg.replace(/\n/g,''));
    cmd.setScrollPerc(100);
    screen.render();
}

if (process.argv.length < 3) {
    console.log('specify a target!');
    process.exit(1)
}

pargs = ['--interpreter=mi2'];
for (let a = 3; a < process.argv.length;a++) {
  pargs.push(process.argv[a]);
}
let child = spawn(process.argv[2], pargs);
child.on('exit', function (code, signal) {
    mylog('child process exited with ' +
                `code ${code} and signal ${signal}`);

    process.exit(1);
});

var stdout_cache = []

function _timerStdout () {
  for (let l in stdout_cache) {
    stdout.log(stdout_cache[l]);
  }
  if(stdout_cache.length) {
    stdout_cache = []
    screen.render();
  }
  setTimeout(_timerStdout, 2);
}

child.stdout.on('data', function(data) {
    stdout_cache.push(data.toString());
});
setTimeout(_timerStdout, 1);

// // child.stderr.on('data', function(data) {
//     mylog(data);
// });

var gdbmi = new gdbmi_class(child)

// setup CTRL-c handler
screen.key(['C-c'], function(ch, key) {
    mylog('CTRL-c');
    child.kill('SIGINT');
    gdbmi.cmdMI('-exec-interrupt --all').then(
      function() {
        mylog('CTRL-c exit');
      }
     );
 });

function _console(data) {
    mylogcmd(data.toString());
}

// listen general status
gdbmi.on('console', _console);

// listen to notiications
gdbmi.on('notify', function(data) {
    mylog('notify ' + data.class);
    switch(data.class) {
        case 'breakpoint-created':
        case 'breakpoint-modified':
            mylog(JSON.stringify(data.bkpt));
            breakpoint_list.push(data.bkpt);
            if (last_stopped_data) {
                get_info(last_stopped_data).then(
                    function() {
                        screen.render();
                        gdbmi.on('console', _console);
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
    gdbmi.removeListener('console', _console);

    let h = source.height;
    let cli = format("list {0}:{1}", data.frame.file, data.frame.line);
    await gdbmi.cmdMI('-stack-list-frames').then(
        function(result) {
            backtrace.setContent('');
            let table = []
            var s = result.stack;
            for (var  i in s) {
                table.push([s[i].level, s[i].func, s[i].line, s[i].file])
                if (s[i].level == 0) {
                  source.label = s[i].fullname;
                }
            }
            backtrace.setData(
              {
                headers: ['Num', 'Function', 'Line', 'File'],
                data: table
              }
            );
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
                    r[2] = r[2].replace(/\n/i, '\\n'); 
                    if ((r[1] == data.frame.line) || bLineBp) {
                        source.setLine(i, ("0" + r[1]).slice(-2) + ' {black-fg}' + bg_color + '{bold}' + r[2] + '{/bold}' + bg_color_end + '{/black-fg}');
                    } else {
                        source.setLine(i, ("0" + r[1]).slice(-2) + ' ' + r[2]);
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
    await new Promise((resolve, reject) => {
      gdbmi.cmd('info locals').then(
        function(result) {
            let table = []
            let w = vars.width;

            function get_type(result, p_r) {
              let  r = result.match(/(.*)\s*=\s*(.*)/i);
              if (!r)
                  return undefined;;
              let r1 = r[1];
                return gdbmi.cmd(format('whatis {0}', r1)).then(
                  function(result) {
                      let r2 = result.match(/type\s*=\s*(.*)/i);
                      if (r2) {
                          table.push([r2[1], r[1], r[2]]);
                      }
                  }
              )
            }

            vars.setContent('');
            result = result.split('\n');
            serial(result, get_type).then(
              function()
              {
                vars.setData(
                {
                  headers: ['Type', 'Name', 'Val'],
                  data: table
                });
                resolve(result);
              }
            );
        }
    )
    });
  }

// called when debugee stopped
gdbmi.on('stopped', function(data) {
    mylog(data.reason);
    input.on('keypress', _keypress);
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
                gdbmi.on('console', _console);
            }
        )

    }
});

gdbmi.on('running', function(data) {
    input.hide();
    statusbar.setText('running');
    screen.render();
});

