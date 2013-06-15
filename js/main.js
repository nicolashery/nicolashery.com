var $ = require('jquery')
  , FastClick = require('fastclick')
  , picturefill = require('./lib/picturefill');

// jQuery plugin
require('jquery-jail');

// On DOM ready
$(function() {
  
  // Initialize FastClick from FT Labs:
  // eliminates the 300ms delay between a physical tap and the firing of a
  // click event on mobile browsers
  new FastClick(document.body);

  // Choose between standard images or retina images, depending on device
  picturefill();

  // Once img elements have been added to the DOM by Picturefill, 
  // launch the async image loader
  $('img.lazy').jail();

});
