const ws = require('ws');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const crypto = require('crypto');

const SharedManager = require('./shared_manager.js');
const SharedFunctions = require('./shared_functions.js');
const SerialPort = require('./serial_port.js');

/*
 * Variables
 */

var lastPongDate;
var webSocketConnection;
var timerUpdateData;
var timerDataHistory;

/*
 * Methods
 */

function startTimerUpdateData() {
	if (timerUpdateData != null) {
		clearInterval(timerUpdateData);
		timerUpdateData = null;
	}
	
	timerUpdateData = setInterval(function() {
		module.exports.sendUpdateData();
	}, SharedManager.service.settings.web_socket_update_data_interval);
};

function stopTimerUpdateData() {
	if (timerUpdateData != null) {
		clearInterval(timerUpdateData);
		timerUpdateData = null;
	}
};

function startTimerDataHistory() {
	if (timerDataHistory != null) {
		clearInterval(timerDataHistory);
		timerDataHistory = null;
	}
	
	if (SerialPort.isSerialPortOpened()) {
		module.exports.sendSaveHistoryData();
	}
	
	timerDataHistory = setInterval(function() {
		if (SerialPort.isSerialPortOpened()) {
			module.exports.sendSaveHistoryData();
		}
	}, SharedManager.service.settings.data_history_saving_interval);
};

function stopTimerDataHistory() {
	if (timerDataHistory != null) {
		clearInterval(timerDataHistory);
		timerDataHistory = null;
	}
};

module.exports.webSocketSend = function(json) {
	var cipher = crypto.createCipher('aes-256-cbc', SharedManager.firmwareSettings.crypto_key, SharedManager.firmwareSettings.crypto_iv);
	var encrypted = Buffer.concat([cipher.update(JSON.stringify(json)), cipher.final()]);
				
	if (webSocketConnection != null && webSocketConnection.readyState == ws.OPEN) {
		webSocketConnection.send(encrypted.toString('hex'));
	}
};

module.exports.init = function() {
	module.exports.connect();
	
	setInterval(function() {
		if (webSocketConnection != null && webSocketConnection.readyState == ws.OPEN) {
			module.exports.webSocketSend({
				command: 'service_ping'
			});
		}	
	}, SharedManager.deviceSettings.web_socket_ping_interval);
	
	setInterval(function() {
		if (lastPongDate != null) {
			const seconds = (((new Date()).getTime() - lastPongDate.getTime()) / 1000);
				
			if (seconds > 30) {
				lastPongDate = null;
				
				if (webSocketConnection != null) {
					webSocketConnection.terminate();
					webSocketConnection = null;
				}
			}
		}
	
		if (webSocketConnection == null) {
			module.exports.connect();
		}
	}, SharedManager.deviceSettings.web_socket_reconnect_interval);
};

module.exports.connect = function() {
	function webSocketConnect() {		
		webSocketConnection = new ws(SharedManager.deviceSettings.web_socket_url, {
			origin: SharedManager.deviceSettings.api_server_url
		});
		
		webSocketConnection.on('open', function() {
			console.log('WebSocket: connected to server.');
			
			var data = SerialPort.data;
			data.serial_port_opened = SerialPort.isSerialPortOpened();
			
			module.exports.webSocketSend({
				command: 'service_connect',
				service_alias: SharedManager.service.service_alias,
				service_type: SharedManager.service.service_type,
				service_folder: SharedManager.service.service_folder,
			  	device_identifier: SharedManager.deviceSettings.device_identifier,
			  	service_version: SharedManager.serviceSettings.service_version,
			  	manufacturer: SharedManager.service.manufacturer,
			  	local_api_server_port: SharedManager.service.local_api_server_port,
			  	data: data
			});
			
			lastPongDate = new Date();
			
			startTimerUpdateData();
			startTimerDataHistory();
		});
	
		webSocketConnection.on('close', function(error) {
			if (error == 3001) {
				console.error('WebSocket: service already exists.');
			} else if (error == 3002) {
				console.error('WebSocket: error adding service.');
			} else {
				console.error('WebSocket: closed.');
			}
			
			webSocketConnection = null;
			
			stopTimerUpdateData();
			stopTimerDataHistory();
		});
	
		webSocketConnection.on('ping', function(data) {
			console.log('WebSocket: ping received.');
			
			lastPingDate = Date.now();
			
			module.exports.sendUpdateData();
		});
	
		webSocketConnection.on('error', function(error) {
		    console.error('WebSocket: ' + error);
		});
	
		webSocketConnection.on('message', function(message) {
		 	var json;
			
			try {
				var decipher = crypto.createDecipher('aes-256-cbc', SharedManager.firmwareSettings.crypto_key, SharedManager.firmwareSettings.crypto_iv);
				var decrypted = Buffer.concat([decipher.update(Buffer.from(message, 'hex')), decipher.final()]);
				
				json = JSON.parse(decrypted.toString());
			} catch (error) {
			}

	 		if (json != null) {
				if (command = json.command) {
					json.device_identifier = SharedManager.deviceSettings.device_identifier;
					json.service = SharedManager.serviceSettings.service;
					
					switch (command) {
						case 'pong': {
							console.log('pong');
							
							lastPongDate = new Date();
							break;
						}
						case 'save_service_settings': {
							SharedFunctions.saveServiceSettings(json.data, function(error, results) {
								if (error) {
									json.error = error;
								
									module.exports.webSocketSend(json);
								} else {
									json.data =  null;
								
									module.exports.webSocketSend(json);
								}
							});
							break;
						}
						case 'load_service_settings': {
							json.results = SharedManager.service.settings;
							
							module.exports.webSocketSend(json);
							break;
						}
						default: {
							module.exports.webSocketSend(json);
							break;
						}
					}
				}
			}
		});
	};
	
	SharedManager.checkInternetConnection(function(error) {
		if (error == null) {
			webSocketConnect();
		} else {
			webSocketConnection == null;
		}
	});
};

module.exports.closeConnection = function() {
	if (webSocketConnection != null && webSocketConnection.readyState == ws.OPEN) {
		webSocketConnection.close();
		webSocketConnection = null;
		
		stopTimerUpdateData();
		stopTimerDataHistory();
	}
};

module.exports.sendUpdateData = function() {
	if (webSocketConnection != null && webSocketConnection.readyState == ws.OPEN) {
		var data = SerialPort.data;
		data.serial_port_opened = SerialPort.isSerialPortOpened();
		
		module.exports.webSocketSend({
			command: 'update_service_data',
			data: data
		});
	}
};

module.exports.sendSaveHistoryData = function() {
	if (webSocketConnection != null && webSocketConnection.readyState == ws.OPEN) {
		var data = SerialPort.data;
		data.serial_port_opened = SerialPort.isSerialPortOpened();
		
		module.exports.webSocketSend({
			command: 'service_save_history_data',
			data: data
		});
		
		return true;
	} else {
		return false;
	}
};

module.exports.isConnected = function() {
	if (webSocketConnection != null && webSocketConnection.readyState == ws.OPEN) {
		return true;
	} else {
		return false;
	}
};