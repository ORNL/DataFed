'use strict';

const path = require('path');

module.exports = (function() {
  var obj = {}

	/**
   * \brief will split a path string into components
   *
   * Example POSIX path
	 * const posixPath = '/usr/local/bin/node';
   * 
   * output: ['usr', 'local', 'bin', 'node']
   *
  **/
  obj.splitPOSIXPath = function(a_posix_path) {

		// Split the path into components
		// components: ['', 'usr', 'local', 'bin', 'node']
		// The empty '' is for root
		const components = posixPath.split(path.posix.sep);

		// components: ['usr', 'local', 'bin', 'node']
		const cleanComponents = components.filter(component => component !== '');


		return components;
	}

});
