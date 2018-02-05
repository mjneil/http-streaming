'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _videoJs = require('video.js');

var _mpdParser = require('mpd-parser');

var _mpdParser2 = _interopRequireDefault(_mpdParser);

var _playlistLoader = require('./playlist-loader');

var DashPlaylistLoader = (function (_EventTarget) {
  _inherits(DashPlaylistLoader, _EventTarget);

  // DashPlaylistLoader must accept either a src url or a playlist because subsequent
  // playlist loader setups from media groups will expect to be able to pass a playlist
  // (since there aren't external URLs to media playlists with DASH)

  function DashPlaylistLoader(srcUrlOrPlaylist, hls, withCredentials) {
    var _this = this;

    _classCallCheck(this, DashPlaylistLoader);

    _get(Object.getPrototypeOf(DashPlaylistLoader.prototype), 'constructor', this).call(this);

    this.hls_ = hls;
    this.withCredentials = withCredentials;

    if (!srcUrlOrPlaylist) {
      throw new Error('A non-empty playlist URL or playlist is required');
    }

    // initialize the loader state
    if (typeof srcUrlOrPlaylist === 'string') {
      this.srcUrl = srcUrlOrPlaylist;
      this.state = 'HAVE_NOTHING';
      return;
    }

    this.state = 'HAVE_METADATA';
    this.started = true;
    // we only should have one, so select it
    this.media(srcUrlOrPlaylist);
    // trigger async to mimic behavior of HLS, where it must request a playlist
    setTimeout(function () {
      _this.trigger('loadedmetadata');
    }, 0);
  }

  _createClass(DashPlaylistLoader, [{
    key: 'dispose',
    value: function dispose() {
      this.stopRequest();
    }
  }, {
    key: 'stopRequest',
    value: function stopRequest() {
      if (this.request) {
        var oldRequest = this.request;

        this.request = null;
        oldRequest.onreadystatechange = null;
        oldRequest.abort();
      }
    }
  }, {
    key: 'media',
    value: function media(playlist) {
      // getter
      if (!playlist) {
        return this.media_;
      }

      // setter
      if (this.state === 'HAVE_NOTHING') {
        throw new Error('Cannot switch media playlist from ' + this.state);
      }

      // find the playlist object if the target playlist has been specified by URI
      if (typeof playlist === 'string') {
        if (!this.master.playlists[playlist]) {
          throw new Error('Unknown playlist URI: ' + playlist);
        }
        playlist = this.master.playlists[playlist];
      }

      var mediaChange = !this.media_ || playlist.uri !== this.media_.uri;

      this.state = 'HAVE_METADATA';
      this.media_ = playlist;

      // trigger media change if the active media has been updated
      if (mediaChange) {
        this.trigger('mediachanging');
        // since every playlist is technically loaded, trigger that we loaded it
        this.trigger('loadedplaylist');
        this.trigger('mediachange');
      }
      return;
    }
  }, {
    key: 'pause',
    value: function pause() {
      this.stopRequest();
      if (this.state === 'HAVE_NOTHING') {
        // If we pause the loader before any data has been retrieved, its as if we never
        // started, so reset to an unstarted state.
        this.started = false;
      }
    }
  }, {
    key: 'load',
    value: function load() {
      // because the playlists are internal to the manifest, load should either load the
      // main manifest, or do nothing but trigger an event
      if (!this.started) {
        this.start();
        return;
      }

      this.trigger('loadedplaylist');
    }
  }, {
    key: 'start',
    value: function start() {
      var _this2 = this;

      this.started = true;

      // request the specified URL
      this.request = this.hls_.xhr({
        uri: this.srcUrl,
        withCredentials: this.withCredentials
      }, function (error, req) {
        // disposed
        if (!_this2.request) {
          return;
        }

        // clear the loader's request reference
        _this2.request = null;

        if (error) {
          _this2.error = {
            status: req.status,
            message: 'DASH playlist request error at URL: ' + _this2.srcUrl,
            responseText: req.responseText,
            // MEDIA_ERR_NETWORK
            code: 2
          };
          if (_this2.state === 'HAVE_NOTHING') {
            _this2.started = false;
          }
          return _this2.trigger('error');
        }

        _this2.master = _mpdParser2['default'].parse(req.responseText, _this2.srcUrl);
        _this2.master.uri = _this2.srcUrl;

        _this2.state = 'HAVE_MASTER';

        // TODO mediaSequence will be added in mpd-parser
        _this2.master.playlists.forEach(function (playlist) {
          playlist.mediaSequence = 0;
        });
        for (var groupKey in _this2.master.mediaGroups.AUDIO) {
          for (var labelKey in _this2.master.mediaGroups.AUDIO[groupKey]) {
            _this2.master.mediaGroups.AUDIO[groupKey][labelKey].playlists.forEach(function (playlist) {
              playlist.mediaSequence = 0;
            });
          }
        }

        // set up phony URIs for the playlists since we won't have external URIs for DASH
        // but reference playlists by their URI throughout the project
        for (var i = 0; i < _this2.master.playlists.length; i++) {
          var phonyUri = 'placeholder-uri-' + i;

          _this2.master.playlists[i].uri = phonyUri;
          // set up by URI references
          _this2.master.playlists[phonyUri] = _this2.master.playlists[i];
        }

        (0, _playlistLoader.setupMediaPlaylists)(_this2.master);
        (0, _playlistLoader.resolveMediaGroupUris)(_this2.master);

        _this2.trigger('loadedplaylist');
        if (!_this2.media_) {
          // no media playlist was specifically selected so start
          // from the first listed one
          _this2.media(_this2.master.playlists[0]);
        }
        // trigger loadedmetadata to resolve setup of media groups
        // trigger async to mimic behavior of HLS, where it must request a playlist
        setTimeout(function () {
          _this2.trigger('loadedmetadata');
        }, 0);
      });
    }
  }]);

  return DashPlaylistLoader;
})(_videoJs.EventTarget);

exports['default'] = DashPlaylistLoader;
module.exports = exports['default'];