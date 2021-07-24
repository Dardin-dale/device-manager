/* 
    This is the main Device Manager, to keep things consistent device commands should be filtered through here accordingly.
    You can just keep serial ports open and contiue to communicate over them. But, in my experience with other seialport libraries in Java
    closing the port and re-opening better ensures that a device is not kept in the Window's registry unintentionally after a disconnection
    and the serial port enumeration works more reliably; this may depend on your device's driver.

    This class is also wrapped into a Singleton instance to prevent 
*/
const SerialPort = require( "serialport" );
const myDevice = require('./myDevice');
const {default: PQueue} = require('p-queue');
const { EventEmitter } = require("events");

//unobtrusive sleep helper function.
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
class DeviceManager {

    constructor () {
        //cmdHandler is a Map {id: Pqueue} for managing incoming promises
        //this should prevent cross-talk and race cases.
        this.cmdHandler = {}
        // Give an accesible device list
        this.devices = {}
        //
        this.events = new EventEmitter()
    }
    
    // helper function that will retrive all of the available serialports on Windows
    // the first two com ports tend to be reserved for the OS hardware.
    _getPorts = function() {
        return new Promise((resolve, reject) => {
            let ports = [];

            SerialPort.list().then((results) => {
                results.forEach((port) => {
                    //e.g: COM4 on Windows, /dev/tty/look_it_up on linux
                    let com = port.path;
                    
                    //TODO: USE Embedded device's VID and PID.
                    if (port.productId === '5740' && port.vendorId === '0483') {
                        ports.push(com);
                        //Adding a promise queue for each device to prevent race cases from the UI
                        if (!this.cmdHandler.hasOwnProperty(com)){
                            this.cmdHandler[com] = new PQueue({concurrency: 1});
                            //This will relay that tasks have been added to the device queue
                            // this.cmdHandler[com].on('add', () => {
                            //     console.log(`Task Added.  Size: ${this.cmdHandler[com].size}  Pending: ${this.cmdHandler[com].pending}`);
                            // });
                        }
                    }
                });

                //fine if there are no ports
                resolve(ports);
                
            }, err => { reject(err); });

        });
    };

    //Retrieves the Serial Number and OEM info from all of the pods available.
    _getDeviceInfo = async function (ports) {
        let pods = [];
        let device_map = {}
        let reconnected_pods = [];
        //pings all devices for information simultaneously
        await Promise.allSettled(ports.map(async (port) => {
            await this.cmdHandler[port].add( async () => {
                let info = { com: port };
                try {
                    let pod = new myDevice(port);
                    let sn = await pod.getSn(false);
                    device_map[sn] = {
                        sn: sn,
                        com: port,
                    };
                    //grabs info from devices, don't close port after call so that same connection can be re-used.
                    info['sn'] = sn;
                    info['fwVersion'] = await pod.getFWVersion(false); // closes port for future use.
                    info['connected'] = true;
                    info['ledOn'] = false;

                    //flash re-connected pod
                    if(this.devices.hasOwnProperty(sn)){
                        await pod.close();
                    } else {
                        reconnected_pods.push([pod, sn]);
                    }
                } catch(e) {
                    console.error(e);
                }
                if (info.connected) {
                    pods.push(info);
                }
                //else not properly connected.
            });
        }))
        // .catch(error => { 
        //     throw error
        // });
        this.trakpods = device_map;
        for (var i =0; i < reconnected_pods.length; i++){
            await this._podReconnection(reconnected_pods[i][0], reconnected_pods[i][1]);
        }
        
        return pods;
    };

    //Check pHTest status and flash accordingly
    _podReconnection = async function(device) {
        //check for active test with TrakPod SN
        if(activeTest){
            await device.close();
            //handled by pHTestManager
            this.events.emit('check_missed_reads', activeTest);
        } else {
            //flash LED to charge Capacitor
            await device.runRP(); // closes port after use.
        }
        
    }

    //main runner for getting devices. gets device serial numbers
    // Runs this in a task scheduler and pass to Redux
    getDevices = async function () {
        try {
            // console.log("getting devices.");
            let pods = [];
            let ports = await this._getPorts();
            //Clean up device manager CQueues
            for (const port in this.cmdHandler) {
                if (!ports.includes(port)) {
                    delete this.cmdHandler[port];
                }
            }

            if (ports) {
                //testing ports with data retrieval ensures the device is connected
                pods = await this._getDeviceInfo(ports);
            }
            
            //sort pods to ensure same behavior from promise.all return
            pods.sort(function (a, b) {
                let sn1 = a.sn;
                let sn2 = b.sn;
                return (sn1 < sn2) ? -1 : (sn1 > sn2) ? 1 : 0;
            });
            return pods;
        }
        catch (err) {
            return Error(err);
        }
    };

    /** 
     * Tells device to collect RP data from the device
     * Blanks added by default
     * @param {deviceJSON} device - json information including COM Identifier
     */
    readRP = async function(device) {
        return await this.cmdHandler[device.com].add(async () => {
            let p_device = new myDevice(device.com);
            let data = await device.runRP();
            return data[0];
        }).catch(err =>{
            return Error(err)
        });
    }

    /**
     * Runs pHtest with pre-formatted string
     *  @param {deviceJSON} device - json information including COM Identifier
     * @param {string} cmdString - full pH test string with comma separated parameter values.
     */
    readCMD = async function(device, cmdString) {
        return await this.cmdHandler[device.com].add(async () => {
            let p_device = new myDevice(device.com);
            let data = await p_device.runCMD(cmdString);
            return data[0];
        }).catch(err =>{
            return Error(err)
        });
    }


    /**
     * Retrieves specified parameter for device
     *  @param {deviceJSON} device - json information including COM Identifier
     * @param {string} param 
     */
    getParam = async function(device, param) {
        return await this.cmdHandler[device.com].add(async () => {
            let p_device = new myDevice(device.com);
            let data = await p_device.getParam(param);
            return data;
        }).catch(err =>{
            return Error(err)
        });
    }

    /**
     * This will set and save a single device parameter. 
     * NOTE: THIS WILL NOT SAVE PARAM PERMANENTLY
     * @param {deviceJSON} device - json information including COM Identifier
     * @param {string} param 
     * @param {string} value 
     */
    _setParam = async function(device, param, value) {
        return await this.cmdHandler[device.com].add(async () => {
            let p_device = new myDevice(device.com);
            let data = await p_device.setParam(param, value);
            return data;
        }).catch(err =>{
            return Error(err)
        });
    }

    /**
     * This will save all current changes to the TrakPod parameters
     * @param {TrakPodJSON} trakpod - trakpod json information
     * @param {string} param 
     * @param {string} value 
     */
    _saveParams = async function(device) {
        return await this.cmdHandler[device.com].add(async () => {
            let p_device = new myDevice(device.com);
            let data = await p_device.saveParams(device);
            return data;
        }).catch(err =>{
            return Error(err)
        });
    }


    /**
     * This will set and save a single TrakPod parameter.
     * @param {deviceJSON} device - json information including COM Identifier
     * @param {string} param 
     * @param {string} value 
     */
    updateParam = async function(device, param, value) {
        try {
            let data = await this._setParam(device, param, value, false);
            data = await this._saveParams(device);
            return data;
        } catch (err) {
            return Error(err);
        }
    }


    
    /**
     * Updates multiple parameters for a Devices and saves them. The device must 
     * remain connected to save all of the parameters correctly.
     * @param {deviceJSON} device - json information including COM Identifier
     * @param {Map} param_map - key value pairs of parameters and updated values
     */
    updateParams = async function(device, param_map) {
        try {
            let data;
            for (param in param_map){
                data = await this.setParam(device, param, param_map[param]);
            }
            data = await device.saveParams();
            return data;
        } catch (err) {
            return Error(err);
        }
    }

    /**
     * Flash LED 3 times to determine location.
     *  @param {deviceJSON} device - json information including COM Identifier
     */
    findFiber = async function(device) {
        return await this.cmdHandler[device.com].add(async() => {
            let p_device = new myDevice(device.com);
            let data;
            for(var i=0; i <= 2; i++){
                data = await p_device.ledOn(false);
                //wait 1 sec
                await sleep(1000);
                data = await device.ledOff(false);
                await sleep(1000);
            }
            await p_device.close();
            return data.toString().trim();
        }).catch( err => {
            console.error(err);
            return Error(err);
        });
    }

}


process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: ', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});

/**
 * Private constructor to convert the Device manager into a singleton instance
 */
 class Singleton {
    constructor() {
        throw new Error('Use DeviceManager.getInstance()');
    }
    
    static getInstance() {
        if (!Singleton.instance) {
            Singleton.instance = new DeviceManager();
        }
        return Singleton.instance;
    }
}


module.exports = Singleton;

