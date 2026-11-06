/*
 * Node 版本检查。这个文件和 bin/joplo.cjs 只用 ES5 语法，旧版 Node 也能解析并打印要求，
 * 不会先因为新语法报出看不懂的堆栈。
 */
'use strict';

var REQUIRED_MAJOR = 22;

/** 返回需要打印的说明；版本满足要求时返回 null。 */
function checkNode(version) {
  var match = /^v?(\d+)\./.exec(String(version || ''));
  var major = match ? parseInt(match[1], 10) : 0;
  if (major >= REQUIRED_MAJOR) return null;
  return '✗ Joplo requires Node.js ' + REQUIRED_MAJOR + ' or later; current version is ' + (version || 'unknown') + '.\n' +
    '  Upgrade: nvm install ' + REQUIRED_MAJOR + ', or download from https://nodejs.org.';
}

module.exports = { checkNode: checkNode, REQUIRED_MAJOR: REQUIRED_MAJOR };
