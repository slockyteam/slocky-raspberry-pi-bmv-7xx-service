const { exec, execSync } = require('child_process');
const merge = require('merge');
const fs = require('fs');

const SharedManager = require('./shared_manager.js');

/*
 * Methods
 */

module.exports.saveServiceSettings = function(data, callback) {
	if (data != null) {
		SharedManager.writeServiceSettings(data);
		
		return callback(null, null);
	} else {
		return callback('missing_parameters', null);
	}
};