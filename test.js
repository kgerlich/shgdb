const gdbmi = require('./gdbmi').gdbmi;
const { spawn } = require('child_process');

let child = spawn('gdb', ['--interpreter=mi'])
let _gdb = new gdbmi(child);

async function start() { 
    await _gdb.cmd('set solib-search-path /home/kgerlicher/temp/shgdb/testapp');
    await _gdb.cmd('file /home/kgerlicher/temp/shgdb/testapp/testapp');
    await _gdb.cmd('b subroutine');
    await _gdb.cmd('run');
}

_gdb.on('stdout', function(data) {
    console.log('stdout:\n' + data.toString());
});


_gdb.on('exec', function(data) {
    console.log('exec: ' + data.class);
});
_gdb.on('notify', function(data) {
    console.log('notify: ' + data.class);
});
_gdb.on('status', function(data) {
    console.log('status: ' + data.class);
});

_gdb.on('console', function(data) {
    console.log('console: ' + JSON.stringify(data));
});

_gdb.on('log', function(data) {
    console.log('log: ' + JSON.stringify(data));
});

_gdb.on('done', function(data) {
    console.log('done: ' + JSON.stringify(data));
});

_gdb.on('stopped', function(data) {
    console.log('STOPPED');
    _gdb.cmdMI('-stack-list-frames').then(
        function(result) {
            console.log(JSON.stringify(result));
        }
    );
});
_gdb.on('running', function(data) {
    console.log('RUNNING');
});


start();
