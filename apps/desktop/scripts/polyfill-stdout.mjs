import process from 'node:process';

const stdout = process.stdout;

if (typeof stdout.clearLine !== 'function') {
  stdout.clearLine = () => true;
}

if (typeof stdout.cursorTo !== 'function') {
  stdout.cursorTo = () => true;
}

if (typeof stdout.moveCursor !== 'function') {
  stdout.moveCursor = () => true;
}

if (typeof stdout.columns !== 'number' || stdout.columns < 1) {
  Object.defineProperty(stdout, 'columns', {
    configurable: true,
    value: 80,
  });
}
