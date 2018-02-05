/**
 * @file - codecs.js - Handles tasks regarding codec strings such as translating them to
 * codec strings, or translating codec strings into objects that can be examined.
 */

'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _videoJs = require('video.js');

var _videoJs2 = _interopRequireDefault(_videoJs);

var _mseCodecUtils = require('../mse/codec-utils');

// Default codec parameters if none were provided for video and/or audio
var defaultCodecs = {
  videoCodec: 'avc1',
  videoObjectTypeIndicator: '.4d400d',
  // AAC-LC
  audioProfile: '2'
};

/**
 * Parses a codec string to retrieve the number of codecs specified,
 * the video codec and object type indicator, and the audio profile.
 */

var parseCodecs = function parseCodecs() {
  var codecs = arguments.length <= 0 || arguments[0] === undefined ? '' : arguments[0];

  var result = {
    codecCount: 0
  };
  var parsed = undefined;

  result.codecCount = codecs.split(',').length;
  result.codecCount = result.codecCount || 2;

  // parse the video codec
  parsed = /(^|\s|,)+(avc[13])([^ ,]*)/i.exec(codecs);
  if (parsed) {
    result.videoCodec = parsed[2];
    result.videoObjectTypeIndicator = parsed[3];
  }

  // parse the last field of the audio codec
  result.audioProfile = /(^|\s|,)+mp4a.[0-9A-Fa-f]+\.([0-9A-Fa-f]+)/i.exec(codecs);
  result.audioProfile = result.audioProfile && result.audioProfile[2];

  return result;
};

exports.parseCodecs = parseCodecs;
/**
 * Replace codecs in the codec string with the old apple-style `avc1.<dd>.<dd>` to the
 * standard `avc1.<hhhhhh>`.
 *
 * @param codecString {String} the codec string
 * @return {String} the codec string with old apple-style codecs replaced
 *
 * @private
 */
var mapLegacyAvcCodecs = function mapLegacyAvcCodecs(codecString) {
  return codecString.replace(/avc1\.(\d+)\.(\d+)/i, function (match) {
    return (0, _mseCodecUtils.translateLegacyCodecs)([match])[0];
  });
};

exports.mapLegacyAvcCodecs = mapLegacyAvcCodecs;
/**
 * Build a media mime-type string from a set of parameters
 * @param {String} type either 'audio' or 'video'
 * @param {String} container either 'mp2t' or 'mp4'
 * @param {Array} codecs an array of codec strings to add
 * @return {String} a valid media mime-type
 */
var makeMimeTypeString = function makeMimeTypeString(type, container, codecs) {
  // The codecs array is filtered so that falsey values are
  // dropped and don't cause Array#join to create spurious
  // commas
  return type + '/' + container + '; codecs="' + codecs.filter(function (c) {
    return !!c;
  }).join(', ') + '"';
};

exports.makeMimeTypeString = makeMimeTypeString;
/**
 * Returns the type container based on information in the playlist
 * @param {Playlist} media the current media playlist
 * @return {String} a valid media container type
 */
var getContainerType = function getContainerType(media) {
  // An initialization segment means the media playlist is an iframe
  // playlist or is using the mp4 container. We don't currently
  // support iframe playlists, so assume this is signalling mp4
  // fragments.
  if (media.segments && media.segments.length && media.segments[0].map) {
    return 'mp4';
  }
  return 'mp2t';
};

exports.getContainerType = getContainerType;
/**
 * Returns a set of codec strings parsed from the playlist or the default
 * codec strings if no codecs were specified in the playlist
 * @param {Playlist} media the current media playlist
 * @return {Object} an object with the video and audio codecs
 */
var getCodecs = function getCodecs(media) {
  // if the codecs were explicitly specified, use them instead of the
  // defaults
  var mediaAttributes = media.attributes || {};

  if (mediaAttributes.CODECS) {
    return parseCodecs(mediaAttributes.CODECS);
  }
  return defaultCodecs;
};

var audioProfileFromDefault = function audioProfileFromDefault(master, audioGroupId) {
  if (!master.mediaGroups.AUDIO || !audioGroupId) {
    return null;
  }

  var audioGroup = master.mediaGroups.AUDIO[audioGroupId];

  if (!audioGroup) {
    return null;
  }

  for (var _name in audioGroup) {
    var audioType = audioGroup[_name];

    if (audioType['default'] && audioType.playlists) {
      // codec should be the same for all playlists within the audio type
      return parseCodecs(audioType.playlists[0].attributes.CODECS).audioProfile;
    }
  }

  return null;
};

/**
 * Calculates the MIME type strings for a working configuration of
 * SourceBuffers to play variant streams in a master playlist. If
 * there is no possible working configuration, an empty array will be
 * returned.
 *
 * @param master {Object} the m3u8 object for the master playlist
 * @param media {Object} the m3u8 object for the variant playlist
 * @return {Array} the MIME type strings. If the array has more than
 * one entry, the first element should be applied to the video
 * SourceBuffer and the second to the audio SourceBuffer.
 *
 * @private
 */
var mimeTypesForPlaylist = function mimeTypesForPlaylist(master, media) {
  var containerType = getContainerType(media);
  var codecInfo = getCodecs(media);
  var mediaAttributes = media.attributes || {};
  // Default condition for a traditional HLS (no demuxed audio/video)
  var isMuxed = true;
  var isMaat = false;

  if (!media) {
    // Not enough information
    return [];
  }

  if (master.mediaGroups.AUDIO && mediaAttributes.AUDIO) {
    var audioGroup = master.mediaGroups.AUDIO[mediaAttributes.AUDIO];

    // Handle the case where we are in a multiple-audio track scenario
    if (audioGroup) {
      isMaat = true;
      // Start with the everything demuxed then...
      isMuxed = false;
      // ...check to see if any audio group tracks are muxed (ie. lacking a uri)
      for (var groupId in audioGroup) {
        // either a uri is present (if the case of HLS and an external playlist), or
        // playlists is present (in the case of DASH where we don't have external audio
        // playlists)
        if (!audioGroup[groupId].uri && !audioGroup[groupId].playlists) {
          isMuxed = true;
          break;
        }
      }
    }
  }

  // HLS with multiple-audio tracks must always get an audio codec.
  // Put another way, there is no way to have a video-only multiple-audio HLS!
  if (isMaat && !codecInfo.audioProfile) {
    if (!isMuxed) {
      // It is possible for codecs to be specified on the audio media group playlist but
      // not on the rendition playlist. This is mostly the case for DASH, where audio and
      // video are always separate (and separately specified).
      codecInfo.audioProfile = audioProfileFromDefault(master, mediaAttributes.AUDIO);
    }

    if (!codecInfo.audioProfile) {
      _videoJs2['default'].log.warn('Multiple audio tracks present but no audio codec string is specified. ' + 'Attempting to use the default audio codec (mp4a.40.2)');
      codecInfo.audioProfile = defaultCodecs.audioProfile;
    }
  }

  // Generate the final codec strings from the codec object generated above
  var codecStrings = {};

  if (codecInfo.videoCodec) {
    codecStrings.video = '' + codecInfo.videoCodec + codecInfo.videoObjectTypeIndicator;
  }

  if (codecInfo.audioProfile) {
    codecStrings.audio = 'mp4a.40.' + codecInfo.audioProfile;
  }

  // Finally, make and return an array with proper mime-types depending on
  // the configuration
  var justAudio = makeMimeTypeString('audio', containerType, [codecStrings.audio]);
  var justVideo = makeMimeTypeString('video', containerType, [codecStrings.video]);
  var bothVideoAudio = makeMimeTypeString('video', containerType, [codecStrings.video, codecStrings.audio]);

  if (isMaat) {
    if (!isMuxed && codecStrings.video) {
      return [justVideo, justAudio];
    }
    // There exists the possiblity that this will return a `video/container`
    // mime-type for the first entry in the array even when there is only audio.
    // This doesn't appear to be a problem and simplifies the code.
    return [bothVideoAudio, justAudio];
  }

  // If there is ano video codec at all, always just return a single
  // audio/<container> mime-type
  if (!codecStrings.video) {
    return [justAudio];
  }

  // When not using separate audio media groups, audio and video is
  // *always* muxed
  return [bothVideoAudio];
};
exports.mimeTypesForPlaylist = mimeTypesForPlaylist;