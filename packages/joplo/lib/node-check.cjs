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
  return '✗ Joplo 需要 Node.js ' + REQUIRED_MAJOR + ' 或更高版本，当前是 ' + (version || '未知') + '。\n' +
    '  升级：nvm install ' + REQUIRED_MAJOR + '，或从 https://nodejs.org 下载。';
}

module.exports = { checkNode: checkNode, REQUIRED_MAJOR: REQUIRED_MAJOR };
