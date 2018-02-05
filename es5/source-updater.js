/**
 * @file source-updater.js
 */
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _videoJs = require('video.js');

var _videoJs2 = _interopRequireDefault(_videoJs);

var noop = function noop() {};

/**
 * A queue of callbacks to be serialized and applied when a
 * MediaSource and its associated SourceBuffers are not in the
 * updating state. It is used by the segment loader to update the
 * underlying SourceBuffers when new data is loaded, for instance.
 *
 * @class SourceUpdater
 * @param {MediaSource} mediaSource the MediaSource to create the
 * SourceBuffer from
 * @param {String} mimeType the desired MIME type of the underlying
 * SourceBuffer
 * @param {Object} sourceBufferEmitter an event emitter that fires when a source buffer is
 * added to the media source
 */

var SourceUpdater = (function () {
  function SourceUpdater(mediaSource, mimeType, sourceBufferEmitter) {
    _classCallCheck(this, SourceUpdater);

    this.callbacks_ = [];
    this.pendingCallback_ = null;
    this.timestampOffset_ = 0;
    this.mediaSource = mediaSource;
    this.processedAppend_ = false;

    if (mediaSource.readyState === 'closed') {
      mediaSource.addEventListener('sourceopen', this.createSourceBuffer_.bind(this, mimeType, sourceBufferEmitter));
    } else {
      this.createSourceBuffer_(mimeType, sourceBufferEmitter);
    }
  }

  _createClass(SourceUpdater, [{
    key: 'createSourceBuffer_',
    value: function createSourceBuffer_(mimeType, sourceBufferEmitter) {
      var _this = this;

      this.sourceBuffer_ = this.mediaSource.addSourceBuffer(mimeType);

      if (sourceBufferEmitter) {
        sourceBufferEmitter.trigger('sourcebufferadded');

        if (this.mediaSource.sourceBuffers.length < 2) {
          // There's another source buffer we must wait for before we can start updating
          // our own (or else we can get into a bad state, i.e., appending video/audio data
          // before the other video/audio source buffer is available and leading to a video
          // or audio only buffer).
          sourceBufferEmitter.on('sourcebufferadded', function () {
            _this.start_();
          });
          return;
        }
      }

      this.start_();
    }
  }, {
    key: 'start_',
    value: function start_() {
      var _this2 = this;

      this.started_ = true;

      // run completion handlers and process callbacks as updateend
      // events fire
      this.onUpdateendCallback_ = function () {
        var pendingCallback = _this2.pendingCallback_;

        _this2.pendingCallback_ = null;

        if (pendingCallback) {
          pendingCallback();
        }

        _this2.runCallback_();
      };

      this.sourceBuffer_.addEventListener('updateend', this.onUpdateendCallback_);

      this.runCallback_();
    }

    /**
     * Aborts the current segment and resets the segment parser.
     *
     * @param {Function} done function to call when done
     * @see http://w3c.github.io/media-source/#widl-SourceBuffer-abort-void
     */
  }, {
    key: 'abort',
    value: function abort(done) {
      var _this3 = this;

      if (this.processedAppend_) {
        this.queueCallback_(function () {
          _this3.sourceBuffer_.abort();
        }, done);
      }
    }

    /**
     * Queue an update to append an ArrayBuffer.
     *
     * @param {ArrayBuffer} bytes
     * @param {Function} done the function to call when done
     * @see http://www.w3.org/TR/media-source/#widl-SourceBuffer-appendBuffer-void-ArrayBuffer-data
     */
  }, {
    key: 'appendBuffer',
    value: function appendBuffer(bytes, done) {
      var _this4 = this;

      this.processedAppend_ = true;
      this.queueCallback_(function () {
        _this4.sourceBuffer_.appendBuffer(bytes);
      }, done);
    }

    /**
     * Indicates what TimeRanges are buffered in the managed SourceBuffer.
     *
     * @see http://www.w3.org/TR/media-source/#widl-SourceBuffer-buffered
     */
  }, {
    key: 'buffered',
    value: function buffered() {
      if (!this.sourceBuffer_) {
        return _videoJs2['default'].createTimeRanges();
      }
      return this.sourceBuffer_.buffered;
    }

    /**
     * Queue an update to remove a time range from the buffer.
     *
     * @param {Number} start where to start the removal
     * @param {Number} end where to end the removal
     * @see http://www.w3.org/TR/media-source/#widl-SourceBuffer-remove-void-double-start-unrestricted-double-end
     */
  }, {
    key: 'remove',
    value: function remove(start, end) {
      var _this5 = this;

      if (this.processedAppend_) {
        this.queueCallback_(function () {
          _this5.sourceBuffer_.remove(start, end);
        }, noop);
      }
    }

    /**
     * Whether the underlying sourceBuffer is updating or not
     *
     * @return {Boolean} the updating status of the SourceBuffer
     */
  }, {
    key: 'updating',
    value: function updating() {
      return !this.sourceBuffer_ || this.sourceBuffer_.updating || this.pendingCallback_;
    }

    /**
     * Set/get the timestampoffset on the SourceBuffer
     *
     * @return {Number} the timestamp offset
     */
  }, {
    key: 'timestampOffset',
    value: function timestampOffset(offset) {
      var _this6 = this;

      if (typeof offset !== 'undefined') {
        this.queueCallback_(function () {
          _this6.sourceBuffer_.timestampOffset = offset;
        });
        this.timestampOffset_ = offset;
      }
      return this.timestampOffset_;
    }

    /**
     * Queue a callback to run
     */
  }, {
    key: 'queueCallback_',
    value: function queueCallback_(callback, done) {
      this.callbacks_.push([callback.bind(this), done]);
      this.runCallback_();
    }

    /**
     * Run a queued callback
     */
  }, {
    key: 'runCallback_',
    value: function runCallback_() {
      var callbacks = undefined;

      if (!this.updating() && this.callbacks_.length && this.started_) {
        callbacks = this.callbacks_.shift();
        this.pendingCallback_ = callbacks[1];
        callbacks[0]();
      }
    }

    /**
     * dispose of the source updater and the underlying sourceBuffer
     */
  }, {
    key: 'dispose',
    value: function dispose() {
      this.sourceBuffer_.removeEventListener('updateend', this.onUpdateendCallback_);
      if (this.sourceBuffer_ && this.mediaSource.readyState === 'open') {
        this.sourceBuffer_.abort();
      }
    }
  }]);

  return SourceUpdater;
})();

exports['default'] = SourceUpdater;
module.exports = exports['default'];