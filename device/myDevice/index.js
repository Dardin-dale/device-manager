/*Device API handles all functions that could be passed to a
device via serialport communications 
assume device takes in ASCII encoded buffer streams that are passed through
the serial port object. Proper commands are dependant on your device's Firmware.
*/

const SerialPort = require( "serialport" );
const params = require("./params");
const Readline = SerialPort.parsers.Readline;

//Simple call just gets basic call response from device
//only verifies that device Acknowledges receipt
//Closing Serialport after call so that connection can be re-established.
simple_call = function (self, resolve, reject, command, closeAfter = true) {
    let timer = setTimeout(() => { 
        self.close() 
        reject("Device timed out. CMD: " + command.toString().trim() + " failed.")
    }, 5000);
    self.port.write(command, 'ascii', function(err) {
        if (err) reject(err);
        self.port.on('data', (data) => {
            let msg = data.toString('utf8').split(";");
            let checksum = msg[1].trim();
            let info = msg[0].split(",");
            if (info[0] === "!NACK") {
                self.port.close(() => {
                    clearTimeout(timer);
                    reject("Command: " + command.toString().trim() + "not properly acknowledged.")
                }); 
            }
            //Validate that all information was correct in the message
            if (!validate_checksum(msg[0], checksum)) {
                self.port.close(() => {
                    clearTimeout(timer);
                    reject("Invalid Checksum returned from Pod.");
                }); 
            }
            if (closeAfter) {
                self.port.close(() => {
                    clearTimeout(timer);
                    resolve(data);
                });
            } else {
                clearTimeout(timer);
                resolve(data);
            }    
        });
    });
};

/*
Data Call, data needs to be retrieved from non_volatile memory on the device.
This data is returned within the Acknowlegement from the device.
Some of the parsing will depend on your device.

Used for GET and SET commands
*/
data_call = function(self, resolve, reject, command) {
    let timer = setTimeout(() => {
        self.close() 
        reject("Device timed out. CMD: " + command.toString().trim() + " failed.")
    }, 10000);
    self.port.write(command, 'ascii', function(err) {
        if (err) reject(err);
        self.port.on('data', (data) => {
            let msg = data.toString('utf8').split(";");
            let checksum = msg[1].trim();
            let info = msg[0].split(",");
            //Validate that the command was properly acknowledged
            if (info[0] === "!ACK") {
                //Do nothing for now...
            } else {
                self.port.close(() => {
                    clearTimeout(timer);
                    reject("Command: " + command.toString().trim() + "not properly acknowledged.")
                }); 
            }
            //Validate that all information was correct in the message
            if (!validate_checksum(msg[0], checksum)) {
                self.port.close(() => {
                    clearTimeout(timer);
                    reject("Invalid Checksum returned from Pod.");
                }); 
            }
            self.port.close(() => {
                clearTimeout(timer);
                resolve(info[3]);
            });
        });
    });
}

/**
 * data without close, Used for getting/setting multiple parameters in sequence
 */
 data_call_no_close = function(self, resolve, reject, command) {
    let timer = setTimeout(() => {
        self.close();
        reject("Device timed out. CMD: " + command.toString().trim() + " failed.")}, 10000);
    self.port.write(command, 'ascii', function(err) {
        if (err) reject(err);
        self.port.on('data', (data) => {
            let msg = data.toString('utf8').split(";");
            let checksum = msg[1].trim();
            let info = msg[0].split(",");
            //Validate that the command was properly acknowledged
            if (info[0] === "!ACK") {
                //Do nothing for now...
            } else {
                reject("Command: " + command.toString().trim() + "not properly acknowledged.")
            }
            //Validate that all information was correct in the message
            if (!validate_checksum(msg[0], checksum)) {
                reject("Invalid Checksum returned from Pod.");
            }
            clearTimeout(timer);
            resolve(info[3]);
        });
    });
}


/*
Long call, waits for an expected response signature,
expected should be the first enum in the returned data
device gives acknowlegement, calculates/collects info, 
then sends second response with the data collected from
the device.

Used for pH and QC readings
*/
long_call = function (self, resolve, reject, command, expected) {
    let collected_data = [];
    let timer = setTimeout(() => {
        self.close();
        reject("Device timed out. CMD: " + command.toString().trim() + " failed.")}, 15000);
    self.port.write(command, 'ascii', function(err) {
        if (err) reject(err);
        self.port.on('data', (data) => {
            let msg = data.toString('utf8').split(";");
            let checksum = msg[1].trim();
            let info = msg[0].split(",");
            //console.log("recieved: ", msg[0]);
            if (!validate_checksum(msg[0], checksum)) {
                self.port.close(()=> {
                    clearTimeout(timer);
                    reject("Invalid Checksum");
                });
            }
            if (info[0] === "!ACK") {
                //Good to do nothing...
                // console.log("Command: " + command.toString().trim() + " acknowledged.");
            } else if (info[0]==="!NACK") {
                self.port.close(() => {
                    clearTimeout(timer);
                    reject("Invalid Command");
                }); 
            } else if (info[0] === expected){
                collected_data.push(msg[0]);
            }
            if (msg[0] === self.idle){
                self.port.close(() => {
                    clearTimeout(timer);
                    resolve(collected_data);
                });
            }
        });

    });
}


// checksum validation, will depend on your device's command process
// This also ensures that all the data is recieved correctly
validate_checksum = function(msg, checksum) {
    let msg_check = generateChecksum(msg);
    return msg_check === checksum;
}

/**
 * Given the message's parameters, generates the correct checksum.
 * 
 * @return The CRC16-IBM checksum of the message.
 */
function generateChecksum(msg) {
    let result ='';
    let calc = 0;
    msg = msg.toString() + "\;";
    let buffer = msg.split("").map(x => x.charCodeAt(0));
    for (var i = 0; i < buffer.length; i++) {
        calc = ComputeCRC16MSB(buffer[i], calc);
    }
    result = calc.toString(16).toUpperCase();
    //ensure 4 character length
    result = result.padStart(4, "0");
    return result;
}

/**
 * Calculates an IBM CRC16 checksum.
 * 
 * @param b The byte of data to process for the checksum.
 * @param crc The previous value of the checksum.
 * @return The new value of the checksum.
 */
function ComputeCRC16MSB(b, crc) {
    let data = b;
    data <<= 8;
    for (var i = 0; i < 8; i++) {
        if (((data ^ crc) & 0x8000) != 0) {
            crc = (0xFFFF) & ((crc << 1) ^ 0x8005);
        } else {
            crc = (0xFFFF) & (crc << 1);
        }
        data <<= 1;
    }
    return crc;
}

/**
 * TrakPod constructs the serialport connection to the TrakPod hardware.
 * This class also sends and retrieves info with the device. All Commands
 * to an instance of TrakPod should be fed through a queue as the devices
 * only handle one command at a time.
 * 
 * @constructor
 * @param {string} id - com port identifier for the device i.e. COM16 on Windows
 */

var MyDevice = function (id) {
    //Creates new Serial Port reference
    this.parser = new Readline({delimiter: ';', encoding: 'ascii'});

    //initiates port serial object
    this.port = new SerialPort(id, baudRate=115200, function(err) {
            if (err) return err;
        });

    this.port.on('error', function(err) {
        console.log("Error: " + err);
        this.port.flush();
        this.port.close();
    })

    //sets up pipe for device readline buffer 
    this.port.pipe(this.parser);

    //COM Port identifier.
    this.com = id;

    //Given when long calls completed.
    this.idle = "!STATUS,IDLE"

    this.close = function() {
        let self = this;
        return new Promise(function(resolve, reject) {
            self.port.close((err) => {
                if (err) {reject(err)}
                resolve();
            } )
        });
    }

    /**
     * Turns Device LED On
     */
    this.ledOn = function(closeAfter = true) {
        let self = this;
        let command = Buffer.from('CAL,0,1\r\n', 'ascii');
        return new Promise(function(resolve, reject) {
            simple_call(self, resolve, reject, command, closeAfter);
        });
    };

    /**
     * Turns LED off
     */
    this.ledOff = function(closeAfter = true) {
        let self = this;
        let command = Buffer.from('CAL,0,0\r\n', 'ascii');
        return new Promise(function(resolve, reject) {
            simple_call(self, resolve, reject, command, closeAfter);
        });
    };

    /**
     * Saves current changes to the TrakPods NV memory parameters
     */
    this.saveParams = function() {
        let self = this;
        let command = Buffer.from('CAL,1,1\r\n', 'ascii');
        return new Promise(function(resolve, reject) {
            simple_call(self, resolve, reject, command);
        });
    };

    /**
     * get generic parameter, must be included in params.
     * @param {string} param - TrakPod parameter to retrieve either name or integer representation
     * @param {boolean} closeAfter - Wether or not to close the serialport upon completion.
     * @returns {string} value of requested parameter
     */
    this.getParam = function(param, closeAfter = true) {
            let self = this;
            let param_id = param;
            //ensure integer representations
            if(typeof param !== "number") {
                param_id = params[param];
            }
            let command = Buffer.from("GET," + param_id + "\r\n", 'utf8');
        return new Promise(function(resolve, reject) {
            if (!params.hasOwnProperty(param)) reject("Error: "+ param + "is not a parameter.");
            if(closeAfter){
                data_call(self, resolve, reject, command);
            } else {
                data_call_no_close(self, resolve, reject, command);
            }
        });
    }

    /**
     * Set generic parameter, must save after changing (saveParams) to make permanent.
     * @param {string} param - The TrakPod parameter to set
     * @param {string} value - The value to set the parameter
     * @param {boolean} closePort - (optional) If the port should be closed afterwards. defaults true.
     */
    this.setParam = function(param, value) {
        let self = this;
        let param_id = param;
        //ensure integer representations
        if(typeof param !== "number") {
            param_id = params[param];
        }
        let command = Buffer.from('SET,'+param_id+','+value+'\r\n');
        return new Promise(function(resolve, reject) {
            if (!params.hasOwnProperty(param)) reject("Error: "+ param + " is not a parameter.");
            if (!params.isValid(param, value)) reject("Error: "+ value + " is not valid for "+ param +".");
            data_call(self, resolve, reject, command);
        });
    }

    /**
     * Retrieves Pod serial number (index 3 in response)
     */
    this.getSn = function(closeAfter = true) {
        let self = this;
        let command = Buffer.from('GET,SER_NUMBER\r\n');
        return new Promise(function(resolve, reject) {
            if(closeAfter){
                data_call(self, resolve, reject, command);
            } else {
                data_call_no_close(self, resolve, reject, command);
            }
        });
    };

    /**
     * Sets Serial Number for the device this is an example of setParam
     * @param {string} serialnumber - the serial number to be set on the device
     */
    this.setSn = function(serialnumber) {
        let self = this;
        let command = Buffer.from('SET,SER_NUMBER,' + serialnumber + '\r\n');
        return new Promise(function(resolve, reject) {
            data_call(self, resolve, reject, command);
        });
    };

    /**
     * Runs RP CMD with or without blanks
     * default is to use blank values
     * @param {boolean} useBlanks - if blank values should be applied to fluorescent readings
     * @returns {Promise<String>} CMD Data
     */
    this.runCMD = function(useBlanks = true) {
        let self = this;
        let command;
        if (useBlanks) {
            command = Buffer.from('RUN_RP,1\r\n');
        } else {
            command = Buffer.from('RUN_RP,0\r\n');
        }
        let expected = "!RP"
        return new Promise(function(resolve,reject){
            long_call(self, resolve, reject, command, expected);
        })
    }

    /**
     * Takes a pH reading on the TrakPod. This will apply the pHID
     * and drift correction based on the parameter String.
     * @param {string} phString - TEST_ID, PHID, TEST_TIME, PH_FREQ
     * @returns {Promise<String>} pH data - SER_NUMBER, PH, FR, FP, RATIO, LED_DRIVE, GAIN_REF, GAIN_PH
     */
    this.runCMD2 = function(cmdString) {
        let self = this;
        let command = Buffer.from('RUN,'+ cmdString +'\r\n');
        let expected = '!My_CMD'
        return new Promise(function(resolve, reject) {
            long_call(self, resolve, reject, command, expected)
        })
    }


    /**
     * Gets the Installed Firmware Version on the TrakPod
     */
    this.getFWVersion = function(closeAfter = true) {
        let self = this;
        let command = Buffer.from('FWVERSION\r\n');
        return new Promise(function(resolve, reject) {
            if(closeAfter){
                data_call(self, resolve, reject, command);
            } else {
                data_call_no_close(self, resolve, reject, command);
            }
        });
    }

}


module.exports = TrakPod;