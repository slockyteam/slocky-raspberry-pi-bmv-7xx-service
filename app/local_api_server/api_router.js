const express = require('express');
const expressListEndpoints = require('express-list-endpoints');
const { exec, execSync } = require('child_process');

const SharedManager = require('./../shared_manager.js');
const WebSocket = require('./../web_socket.js');
const SerialPort = require('./../serial_port.js');

/**
 * Variables
 */

var router = express.Router();

/**
 * Router
 */

// Home page

router.get('/', function(req, res) {
	return res.status(200).send(expressListEndpoints(router));
});

router.get('/service_info', function(req, res) {
	var results = {
		status: WebSocket.isConnected() ? 'online' : 'offline',
		service_alias: SharedManager.service.service_alias,
		service_type: SharedManager.service.service_type,
		service_folder: SharedManager.service.service_folder,
	  	device_identifier: SharedManager.deviceSettings.device_identifier,
	  	service_version: SharedManager.serviceSettings.service_version,
	  	manufacturer: SharedManager.service.manufacturer,
	  	local_api_server_port: SharedManager.service.local_api_server_port
	};
	
	return res.status(200).send(results);
});

router.get('/data', function(req, res) {
	var data = SerialPort.data;
	data.serial_port_opened = SerialPort.isSerialPortOpened();
	
	return res.status(200).send(data);
});

/**
 * Module exports
 */

module.exports = router;
