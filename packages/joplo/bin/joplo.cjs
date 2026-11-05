#!/usr/bin/env node
/*
 * joplo 命令入口。先检查 Node 版本（ES5 语法，不加载其他模块），通过后才载入 lib/main.cjs。
 */
'use strict';

var message = require('../lib/node-check.cjs').checkNode(process.versions.node);
if (message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}
require('../lib/main.cjs').main();
