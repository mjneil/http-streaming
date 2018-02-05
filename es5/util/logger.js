'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _videoJs = require('video.js');

var _videoJs2 = _interopRequireDefault(_videoJs);

var logger = function logger(source) {
  if (_videoJs2['default'].log.debug) {
    return _videoJs2['default'].log.debug.bind(_videoJs2['default'], 'VHS:', source + ' >');
  }

  return function () {};
};

exports['default'] = logger;
module.exports = exports['default'];