const SerialPort = require('serialport');
const ByteLength = require('@serialport/parser-byte-length');
const { exec, execSync } = require('child_process');

const WebSocket = require('./web_socket.js');
const SharedManager = require('./shared_manager.js');

/*
 * Variables
 */

var parser;
module.exports.data = {};
var sendFirst = false;

/*
 * Methods
 */

module.exports.openSerialPort = function() {
	if (SharedManager.service.settings.serial_port != null && SharedManager.service.settings.baud_rate != null) {
		if (SharedManager.service.settings.status_led_gpio_pin != null) {
			exec('echo "' + String(SharedManager.service.settings.status_led_gpio_pin) + '" > /sys/class/gpio/export', (error, stdout, stderr) => {
			});
			exec('echo "out" > /sys/class/gpio/gpio' + String(SharedManager.service.settings.status_led_gpio_pin) + '/direction', (error, stdout, stderr) => {
			});
			exec('echo "0" > /sys/class/gpio/gpio' + String(SharedManager.service.settings.status_led_gpio_pin) + '/value', (error, stdout, stderr) => {
			});
		}
		
		module.exports.serialPort = new SerialPort(SharedManager.service.settings.serial_port, { 
		    baudRate: SharedManager.service.settings.baud_rate, 
		    databits: SharedManager.service.settings.databits, 
		    parity: SharedManager.service.settings.parity, 
		    stopBits: SharedManager.service.settings.stop_bits, 
		    flowControl: SharedManager.service.settings.flow_control
		}, function (error) {
			if (error) {
				console.log(error);
			} else {
				console.log('Serial port: ' + SharedManager.service.settings.serial_port  + ' opened.');
				
				parser = module.exports.serialPort.pipe(new ByteLength({ length: 1 }));
				
				var state = 'wait_header';
				var bytesSum = 0;
				var key = '';
				var value = '';
				var dict = {};
				
				parser.on('data', function (data) {
					if (data.length > 0) {
						var byteValue = data[0];
						
						switch (state) {
							case 'wait_header': {
								bytesSum += byteValue;
								
								if (byteValue == 0x0D) {
									state = 'wait_header';
								} else if (byteValue == 0x0A) {
									state = 'in_key';
								}
								break;
							}
							case 'in_key': {
								bytesSum += byteValue;
								
								if (byteValue == 0x09) {
									if (key === 'Checksum') {
										state = 'in_checksum';
									} else {
										state = 'in_value';
									}
								} else {
									key += String.fromCharCode(byteValue);
								}
								break;
							}
							case 'in_value': {
								bytesSum += byteValue;
								
								if (byteValue == 0x0D) {
									state = 'wait_header';
									
									dict[key] = value;
									key = '';
									value = '';
								} else {
									value += String.fromCharCode(byteValue);
								}
								break;
							}
							case 'in_checksum': {
								bytesSum += byteValue;
								key = '';
								value = '';
								state = 'wait_header';
								
								if ((bytesSum % 256) == 0) {
									dict.timestamp = new Date();
									module.exports.data = Object.assign({}, dict);
									
									if (!sendFirst) {
										sendFirst = true;
										
										WebSocket.sendUpdateData();
									}
									
									if (SharedManager.service.settings.status_led_gpio_pin != null) {
										exec('echo "1" > /sys/class/gpio/gpio' + String(SharedManager.service.settings.status_led_gpio_pin) + '/value', (error, stdout, stderr) => {
										});
										
										if (ledTimer != null) {
											clearTimeout(ledTimer);
											ledTimer = null;
										}
										
										ledTimer = setTimeout(function() {
											exec('echo "0" > /sys/class/gpio/gpio' + String(SharedManager.service.settings.status_led_gpio_pin) + '/value', (error, stdout, stderr) => {
											});
										}, 5000);
									}
								}
								
								bytesSum = 0;
								dict = {};
								break;
							}
						}
					}
				});
			}
		});
		
		return true;
	} else {
		return false;
	}
};

module.exports.closeSerialPort = function() {
	if (module.exports.serialPort != undefined && module.exports.serialPort != null && module.exports.serialPort.isOpen == true) {
		module.exports.serialPort.close();
		module.exports.serialPort = null;
		
		return true;
	} else {
		return false;
	}
};

module.exports.init = function() {
	module.exports.openSerialPort();
};

module.exports.isSerialPortOpened = function() {
	if (module.exports.serialPort != undefined && module.exports.serialPort != null && module.exports.serialPort.isOpen == true) {
		return true;
	} else {
		return false;
	}
};